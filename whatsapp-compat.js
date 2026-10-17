// Runs inside WhatsApp's browser. Read only summaries without serializing groups,
// contacts or newsletters: one incompatible group must not hide individual chats.
function readChatSummaries() {
  const collection = window.require('WAWebCollections').Chat;
  const result = [];
  for (const chat of collection.getModelsArray()) {
    try {
      const id = chat.id?._serialized;
      if (!/^\d{5,20}@(c\.us|lid)$/.test(id)) continue;
      const messages = chat.msgs?.getModelsArray?.() || [];
      const last = messages[messages.length - 1];
      result.push({ id, name: String(chat.formattedTitle || chat.name || id.split('@')[0]),
        unread: Number(chat.unreadCount || 0), timestamp: Number(chat.t || last?.t || 0),
        preview: String(last?.body || (last?.type && last.type !== 'chat' ? '[Anexo]' : '')), archived: !!chat.archive });
    } catch { /* An invalid model cannot prevent loading other individual chats. */ }
  }
  return result;
}
module.exports = { readChatSummaries };

function inspectWhatsAppConnection() {
  try {
    const socket = window.require('WAWebSocketModel').Socket;
    const chats = window.require('WAWebCollections').Chat;
    return { socketState:socket.state, connected: socket.state === 'CONNECTED', readable: typeof chats?.getModelsArray === 'function',
      bridgeReady: ['getChat','getMessageModel','sendMessage'].every(name => typeof window.WWebJS?.[name] === 'function') };
  } catch { return { connected: false, readable: false, bridgeReady: false }; }
}
module.exports.inspectWhatsAppConnection = inspectWhatsAppConnection;
