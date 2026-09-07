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
import { envelope, resolveAdd } from './events.mjs';
import { settlePairing, selectGroup } from './session.mjs';

process.umask(0o077);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const configPath = path.join(root, 'config.local.json');
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
let chatId = config.whatsapp_chat_id;
const listing = args.includes('--list');
const self = args.includes('--self');
const watch = args.includes('--watch');
const pairing = args.includes('--pair');
const groupIndex = args.indexOf('--group');
const groupName = groupIndex >= 0 ? args[groupIndex + 1] : null;
if (groupIndex >= 0 && (!groupName || groupName.startsWith('--'))) throw new Error('--group requires an exact group name');
const limitIndex = args.indexOf('--limit');
const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : 250;
if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new Error('Limit must be between 1 and 5000');
if (!chatId && !listing && !self && !groupName) throw new Error('Choose --group, --self, or --list');
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
let pairedThisRun = false;
let pending = Promise.resolve();
async function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  await pending.catch(() => {});
  await client.destroy().catch(() => {});
  process.exit(code);
}
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
client.on('qr', qr => {
  if (!pairing) {
    console.error('Pairing required. Run sync whatsapp --pair --group "Job to-do" and scan the terminal QR. Existing session files have been preserved.');
    void shutdown(2);
    return;
  }
  pairedThisRun = true;
  console.error('Scan this code in WhatsApp → Settings → Linked Devices. Keep this process running until setup finishes.');
  qrcode.generate(qr, { small: true });
});
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
  const request = await resolveAdd(message, chatId);
  if (!request) return false;
  const base = envelope(message, chatId);
  if (seen.has(base.source_id)) return false;
  const key = createHash('sha256').update(base.source_id).digest('hex');
  const attachments = [];
  if (request.source.hasMedia) {
    const media = await request.source.downloadMedia();
    if (!media) throw new Error('Attachment unavailable; event remains pending for retry/export recovery');
    const bytes = Buffer.from(media.data, 'base64');
    if (bytes.length > (config.max_download_bytes || 26214400)) throw new Error('Attachment exceeds configured size limit');
    const filename = `${key}-${path.basename(media.filename || 'attachment.bin')}`;
    const target = path.join(spool, filename);
    durable(target, bytes);
    attachments.push({ path: target, name: media.filename || filename, mime: media.mimetype });
  }
  const target = path.join(spool, `${key}.jsonl`);
  const event = envelope(message, chatId, attachments);
  event.text = [request.text, request.comment].filter(Boolean).join('\n\nYour comment: ');
  event.command = { id: message.id._serialized, text: message.body };
  event.referenced_message = { id: request.source.id._serialized, sender: request.source.author || request.source.from,
    timestamp: request.source.timestamp, text: request.source.body || '' };
  durable(target, JSON.stringify(event) + '\n');
  const result = spawnSync(path.join(root, '.venv/bin/library'), ['--root', root, 'import-events', target], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Local ingestion failed; durable event retained in state/whatsapp-spool for retry');
  seen.add(base.source_id);
  durable(seenFile, JSON.stringify([...seen]));
  return true;
}
client.on('ready', async () => {
  try {
    if (pairedThisRun) console.error('Linked successfully. Allowing 60 seconds for initial session synchronization before continuing…');
    await settlePairing(pairedThisRun);
    if (closing) return;
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
    if (groupName) {
      chatId = selectGroup(await client.getChats(), groupName);
      config.whatsapp_chat_id = chatId;
      config.whatsapp_group_name = groupName;
      durable(configPath, JSON.stringify(config, null, 2));
      console.error(`Selected group: ${groupName}. Only your !add commands will be saved.`);
    }
    // Install the listener before backfill to close the startup event gap.
    const enqueue = message => {
      const task = pending.then(() => closing ? false : collect(message));
      pending = task.catch(() => {});
      return task;
    };
    if (watch) client.on('message_create', message => { void enqueue(message).catch(error => console.error(error.message)); });
    const chat = await client.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit });
    let captured = 0, failed = 0;
    for (const message of messages) {
      try {
        if (watch) captured += Number(await enqueue(message));
        else captured += Number(await collect(message));
      }
      catch (error) { failed++; console.error(error.message); }
    }
    console.log(JSON.stringify({ captured, failed, inspected: messages.length, historyComplete: false,
      warning: 'Bounded linked-device history only. Export recovery may be needed after downtime.' }));
    if (!watch) return shutdown(failed ? 1 : 0);
    console.error('Watching for your !add commands. No WhatsApp replies are sent. Keep this process and laptop awake.');
  } catch (error) { console.error(error.message); shutdown(1); }
});
client.initialize().catch(error => { console.error(error.message); shutdown(1); });
