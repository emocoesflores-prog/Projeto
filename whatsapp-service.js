const path = require('node:path');
function createWhatsAppService({ clientFactory, qrEncoder, initializationTimeoutMs = 90000, dataPath = path.join(__dirname, '.wwebjs_auth') } = {}) {
  let client, starting, startupTimer, generation = 0;
  let state = { status: 'disconnected', qr: null, error: null };
  const failureMessage = error => {
    const message = String(error?.message || '');
    if (/could not find chrome|executable.*doesn.t exist|browser was not found/i.test(message)) return 'Chrome não encontrado. No terminal do projeto, execute: npx puppeteer browsers install chrome';
    if (/user data directory.*in use|browser is already running|SingletonLock/i.test(message)) return 'A sessão está em uso por outro navegador. Encerre a outra instância deste sistema e tente novamente.';
    if (/ERR_|navigation.*timeout|net::/i.test(message)) return 'Não foi possível acessar o WhatsApp Web. Confira a conexão de internet e o firewall deste computador.';
    return 'Não foi possível iniciar o WhatsApp. Confira o Chrome instalado e se outra instância está usando a sessão.';
  };
  const requireReady = () => {
    if (state.status !== 'ready' || !client) throw Object.assign(new Error('Conecte o WhatsApp antes de continuar.'), { status: 409 });
    return client;
  };
  return {
    status: () => ({ ...state }),
    async connect() {
      if (starting || ['starting', 'ready', 'qr', 'authenticated'].includes(state.status)) return;
      clearTimeout(startupTimer);
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
        startupTimer = setTimeout(() => {
          if (generation !== current || state.status !== 'starting') return;
          ++generation; starting = null;
          state = { status: 'error', qr: null, error: 'O WhatsApp não respondeu em 90 segundos. Confira a internet, desconecte o aparelho neste painel e tente novamente.' };
          Promise.resolve(client.destroy()).catch(() => {});
        }, initializationTimeoutMs);
        startupTimer.unref?.();
        client.on('qr', async qr => {
          clearTimeout(startupTimer);
          try {
            const image = await (qrEncoder || require('qrcode').toDataURL)(qr);
            if (generation === current) state = { status: 'qr', qr: image, error: null };
          } catch { if (generation === current) state = { status: 'error', qr: null, error: 'Falha ao gerar QR Code.' }; }
        });
        client.on('authenticated', () => { clearTimeout(startupTimer); if (generation === current) state = { status: 'authenticated', qr: null, error: null }; });
        client.on('ready', () => { clearTimeout(startupTimer); if (generation === current) state = { status: 'ready', qr: null, error: null }; });
        for (const event of ['auth_failure', 'disconnected']) client.on(event, () => {
          if (generation === current) state = { status: 'disconnected', qr: null, error: 'Conexão encerrada. Conecte novamente.' };
        });
        starting = Promise.resolve(client.initialize()).catch(error => {
          clearTimeout(startupTimer);
          if (generation === current) state = { status: 'error', qr: null, error: failureMessage(error) };
        }).finally(() => { if (generation === current) starting = null; });
      } catch(error) {
        clearTimeout(startupTimer);
        starting = null;
        state = { status: 'error', qr: null, error: failureMessage(error) };
      }
    },
    async disconnect() {
      clearTimeout(startupTimer);
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
