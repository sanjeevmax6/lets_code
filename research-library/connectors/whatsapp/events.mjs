import { createHash } from 'node:crypto';

export function chatForMessage(message) {
  return message.fromMe ? message.to : message.from;
}

export function accepts(message, chatId) {
  return chatForMessage(message) === chatId;
}

export async function resolveAdd(message, chatId) {
  // fromMe is supplied by the authenticated client, not inferred from display names.
  if (!accepts(message, chatId) || !message.fromMe || !/^!add(?:\s|$)/i.test(message.body || '')) return null;
  const comment = message.body.replace(/^!add\s*/i, '').trim();
  let source = message;
  if (message.hasQuotedMsg) {
    source = await message.getQuotedMessage();
    if (!source || !accepts(source, chatId)) throw new Error('Quoted message unavailable in this group; resend the link or PDF with !add.');
  }
  const text = source === message ? comment : source.body || '';
  if (!source.hasMedia && !/https?:\/\/\S+/i.test(text)) throw new Error('Reply !add to a link/PDF, or send !add followed by a URL.');
  return { source, text, comment: source === message ? '' : comment };
}

export function envelope(message, chatId, attachments = []) {
  if (!accepts(message, chatId)) throw new Error('Message is outside the allowlisted chat');
  const revision = createHash('sha256').update(message.body || '').digest('hex').slice(0, 16);
  return {
    source: 'whatsapp-linked-device', source_id: `${message.id._serialized}:${revision}`,
    chat_id: chatId, sender: message.author || message.from,
    saved_at: new Date(message.timestamp * 1000).toISOString(),
    text: message.body || '', attachments,
  };
}
