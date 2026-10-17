const path = require('node:path');
function createWhatsAppService({ clientFactory, qrEncoder, initializationTimeoutMs = 90000, dataPath = path.join(__dirname, '.wwebjs_auth') } = {}) {
  let client, starting, startupTimer, generation = 0;
  let state = { status: 'disconnected', qr: null, error: null };
  const failureMessage = error => {
    const message = String(error?.message || error || '');
    if (/auth timeout|ready timeout/i.test(message)) return 'O WhatsApp abriu, mas não concluiu a autenticação. Ative WHATSAPP_HEADLESS=false no .env para verificar a janela do navegador.';
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
        const options = {
          // Do not serve an old cached WhatsApp HTML or impersonate Chrome 101.
          webVersionCache: { type: 'none' },
          userAgent: false,
          authTimeoutMs: 60000,
          puppeteer: {
            headless: process.env.WHATSAPP_HEADLESS !== 'false',
            ...(process.env.WHATSAPP_BROWSER_PATH ? { executablePath: process.env.WHATSAPP_BROWSER_PATH } : {})
          }
        };
        if (clientFactory) client = clientFactory(options);
        else {
          const { Client, LocalAuth } = require('whatsapp-web.js');
          client = new Client({ ...options, authStrategy: new LocalAuth({ dataPath }) });
        }
        const armTimeout = () => {
        clearTimeout(startupTimer);
        startupTimer = setTimeout(() => {
          if (generation !== current || !['starting', 'authenticated'].includes(state.status)) return;
          ++generation; starting = null;
          state = { status: 'error', qr: null, error: 'A inicialização do WhatsApp demorou demais. Reinicie o servidor; se persistir, defina WHATSAPP_HEADLESS=false no .env para verificar a janela. A sessão salva foi preservada.' };
          Promise.resolve().then(() => client.destroy()).catch(() => {});
        }, initializationTimeoutMs);
        startupTimer.unref?.();
        };
        armTimeout();
        client.on('qr', async qr => {
          if (generation !== current) return;
          clearTimeout(startupTimer);
          try {
            const image = await (qrEncoder || require('qrcode').toDataURL)(qr);
            if (generation === current && ['starting', 'qr'].includes(state.status)) state = { status: 'qr', qr: image, error: null };
          } catch { if (generation === current) state = { status: 'error', qr: null, error: 'Falha ao gerar QR Code.' }; }
        });
        client.on('authenticated', () => { if (generation === current) { state = { status: 'authenticated', qr: null, error: null }; armTimeout(); } });
        client.on('ready', () => { if (generation === current) { clearTimeout(startupTimer); state = { status: 'ready', qr: null, error: null }; } });
        for (const event of ['auth_failure', 'disconnected']) client.on(event, () => {
          if (generation === current) state = { status: 'disconnected', qr: null, error: 'Conexão encerrada. Conecte novamente.' };
        });
        starting = Promise.resolve(client.initialize()).catch(error => {
          if (generation === current) { clearTimeout(startupTimer); state = { status: 'error', qr: null, error: failureMessage(error) }; }
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
