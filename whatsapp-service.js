const path = require('node:path');
function createWhatsAppService({ clientFactory, qrEncoder, dataPath = path.join(__dirname, '.wwebjs_auth') } = {}) {
  let client, starting, generation = 0;
  let state = { status: 'disconnected', qr: null, error: null };
  const requireReady = () => {
    if (state.status !== 'ready' || !client) throw Object.assign(new Error('Conecte o WhatsApp antes de continuar.'), { status: 409 });
    return client;
  };
  return {
    status: () => ({ ...state }),
    async connect() {
      if (starting || ['starting', 'ready', 'qr', 'authenticated'].includes(state.status)) return;
      const current = ++generation;
      state = { status: 'starting', qr: null, error: null };
      try {
        if (client) await client.destroy();
        if (clientFactory) client = clientFactory();
        else {
          const { Client, LocalAuth } = require('whatsapp-web.js');
          client = new Client({ authStrategy: new LocalAuth({ dataPath }), puppeteer: {
            headless: true,
            ...(process.env.WHATSAPP_BROWSER_PATH ? { executablePath: process.env.WHATSAPP_BROWSER_PATH } : {})
          } });
        }
        client.on('qr', async qr => {
          try {
            const image = await (qrEncoder || require('qrcode').toDataURL)(qr);
            if (generation === current) state = { status: 'qr', qr: image, error: null };
          } catch { if (generation === current) state = { status: 'error', qr: null, error: 'Falha ao gerar QR Code.' }; }
        });
        client.on('authenticated', () => { if (generation === current) state = { status: 'authenticated', qr: null, error: null }; });
        client.on('ready', () => { if (generation === current) state = { status: 'ready', qr: null, error: null }; });
        for (const event of ['auth_failure', 'disconnected']) client.on(event, () => {
          if (generation === current) state = { status: 'disconnected', qr: null, error: 'Conexão encerrada. Conecte novamente.' };
        });
        starting = Promise.resolve(client.initialize()).catch(() => {
          if (generation === current) state = { status: 'error', qr: null, error: 'Não foi possível iniciar o WhatsApp. Verifique o navegador e o acesso à rede no servidor.' };
        }).finally(() => { if (generation === current) starting = null; });
      } catch {
        starting = null;
        state = { status: 'error', qr: null, error: 'Não foi possível iniciar o navegador do WhatsApp.' };
      }
    },
    async disconnect() {
      ++generation;
      starting = null;
      const old = client;
      client = null;
      state = { status: 'disconnected', qr: null, error: null };
      if (old) { try { await old.logout(); } finally { await old.destroy(); } }
    },
    async chats() {
      const chats = await requireReady().getChats();
      return chats.filter(c => !c.isGroup && /^\d+@c\.us$/.test(c.id._serialized)).sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0,100).map(c => ({ id: c.id._serialized, name: c.name, unread: c.unreadCount, timestamp: c.timestamp }));
    },
    async messages(id) {
      const chat = await requireReady().getChatById(id);
      return (await chat.fetchMessages({ limit: 50 })).map(m => ({ id: m.id._serialized, body: m.body, fromMe: m.fromMe, timestamp: m.timestamp, hasMedia: m.hasMedia }));
    },
    async send(id, body) {
      const result = await requireReady().sendMessage(id, body);
      return { id: result.id._serialized };
    }
  };
}
module.exports = { createWhatsAppService };
