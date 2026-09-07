// Evaluated in the authenticated connector page. Avoid getChats/getChatModel:
// upstream 1.34.7 refreshes every group's participant metadata and can fail
// the whole index with `r: r`. See wwebjs/whatsapp-web.js#201910.
// Intake needs only cached titles and IDs, never participant metadata.
export function readChatIndex() {
  return window.require('WAWebCollections').Chat.getModelsArray().map(chat => {
    const wid = chat.id;
    const id = wid?._serialized || wid?.$1 ||
      (wid?.user && wid?.server ? `${wid.user}@${wid.server}` : null);
    if (typeof id !== 'string') throw new Error('Unsupported WhatsApp chat identifier');
    return { id: { _serialized: id }, name: chat.formattedTitle || chat.name || '',
      isGroup: id.endsWith('@g.us') };
  });
}
