import { createHash } from 'node:crypto';

export function chatForMessage(message) {
  return message.fromMe ? message.to : message.from;
}

export function accepts(message, chatId) {
  return chatForMessage(message) === chatId;
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
