// Preload Puppeteer's ESM module before the upstream CommonJS client requires it.
await import('puppeteer');
const { default: wwebjs } = await import('whatsapp-web.js');
import qrcode from 'qrcode-terminal';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { accepts, envelope } from './events.mjs';

process.umask(0o077);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const configPath = path.join(root, 'config.local.json');
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
let chatId = config.whatsapp_chat_id;
const listing = args.includes('--list');
const self = args.includes('--self');
const watch = args.includes('--watch');
const limitIndex = args.indexOf('--limit');
const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : 250;
if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new Error('Limit must be between 1 and 5000');
if (!chatId && !listing && !self) throw new Error('Choose --self, --list, or set whatsapp_chat_id in config.local.json');
const sessionDir = path.resolve(config.whatsapp_session_dir || path.join(os.homedir(), '.local/share/research-library/whatsapp-session'));
const relativeSession = path.relative(root, sessionDir);
if (!relativeSession.startsWith('..') && !path.isAbsolute(relativeSession)) throw new Error('Session directory must be outside the library');
fs.mkdirSync(sessionDir, { recursive: true, mode: 0o700 });
const spool = path.join(root, 'state/whatsapp-spool');
fs.mkdirSync(spool, { recursive: true });
const client = new wwebjs.Client({
  authStrategy: new wwebjs.LocalAuth({ dataPath: sessionDir }),
  puppeteer: { headless: true, executablePath: process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
  webVersionCache: { type: 'local', path: path.join(sessionDir, 'web-cache') },
  qrMaxRetries: 3,
});
let closing = false;
async function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  await client.destroy().catch(() => {});
  process.exit(code);
}
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
client.on('qr', qr => { console.error('Scan this code in WhatsApp → Settings → Linked Devices.'); qrcode.generate(qr, { small: true }); });
client.on('auth_failure', () => { console.error('WhatsApp authentication failed; pair again.'); shutdown(1); });
client.on('disconnected', () => { console.error('WhatsApp disconnected; rerun sync to reconnect.'); shutdown(1); });
const seenFile = path.join(spool, 'seen.json');
const seen = new Set(fs.existsSync(seenFile) ? JSON.parse(fs.readFileSync(seenFile, 'utf8')) : []);
function durable(file, data) {
  const temporary = file + '.tmp';
  const fd = fs.openSync(temporary, 'w', 0o600);
  try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temporary, file);
  const directory = fs.openSync(path.dirname(file), 'r');
  try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
}
async function collect(message) {
  if (!accepts(message, chatId)) return false;
  const base = envelope(message, chatId);
  if (seen.has(base.source_id)) return false;
  const key = createHash('sha256').update(base.source_id).digest('hex');
  const attachments = [];
  if (message.hasMedia) {
    const media = await message.downloadMedia();
    if (!media) throw new Error('Attachment unavailable; event remains pending for retry/export recovery');
    const bytes = Buffer.from(media.data, 'base64');
    if (bytes.length > (config.max_download_bytes || 26214400)) throw new Error('Attachment exceeds configured size limit');
    const filename = `${key}-${path.basename(media.filename || 'attachment.bin')}`;
    const target = path.join(spool, filename);
    durable(target, bytes);
    attachments.push({ path: target, name: media.filename || filename, mime: media.mimetype });
  }
  const target = path.join(spool, `${key}.jsonl`);
  durable(target, JSON.stringify(envelope(message, chatId, attachments)) + '\n');
  const result = spawnSync(path.join(root, '.venv/bin/library'), ['--root', root, 'import-events', target], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Local ingestion failed; durable event retained in state/whatsapp-spool for retry');
  seen.add(base.source_id);
  durable(seenFile, JSON.stringify([...seen]));
  return true;
}
client.on('ready', async () => {
  try {
    if (listing) {
      const chats = await client.getChats();
      console.log(JSON.stringify(chats.map(c => ({ id: c.id._serialized, name: c.name, isGroup: c.isGroup })), null, 2));
      return shutdown();
    }
    if (self) {
      chatId = client.info.wid._serialized;
      config.whatsapp_chat_id = chatId;
      durable(configPath, JSON.stringify(config, null, 2));
    }
    const chat = await client.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit });
    let captured = 0, failed = 0;
    for (const message of messages) {
      try { captured += Number(await collect(message)); }
      catch (error) { failed++; console.error(error.message); }
    }
    console.log(JSON.stringify({ captured, failed, inspected: messages.length, historyComplete: false,
      warning: 'Bounded linked-device history only. Export recovery may be needed after downtime.' }));
    if (!watch) return shutdown(failed ? 1 : 0);
    // Includes outgoing/self messages. Serialize writes to avoid racing checkpoints.
    let pending = Promise.resolve();
    client.on('message_create', message => {
      pending = pending.then(() => collect(message)).catch(error => console.error(error.message));
    });
    console.error('Watching the selected chat while this process and laptop remain awake.');
  } catch (error) { console.error(error.message); shutdown(1); }
});
client.initialize().catch(error => { console.error(error.message); shutdown(1); });
