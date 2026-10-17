const path = require('node:path');
function createWhatsAppService({ clientFactory, qrEncoder, initializationTimeoutMs = 90000, dataPath = path.join(__dirname, '.wwebjs_auth') } = {}) {
  let client, starting, startupTimer, generation = 0, probing = null;
  let state = { status: 'disconnected', qr: null, error: null };
  const failureMessage = error => {
    const message = String(error?.message || error || '');
    if (/auth timeout|ready timeout/i.test(message)) return 'O WhatsApp abriu, mas não concluiu a autenticação. Ative WHATSAPP_SHOW_BROWSER=true no .env para verificar a janela do navegador.';
    if (/could not find chrome|executable.*doesn.t exist|browser was not found/i.test(message)) return 'Chrome não encontrado. No terminal do projeto, execute: npx puppeteer browsers install chrome';
    if (/user data directory.*in use|browser is already running|SingletonLock/i.test(message)) return 'A sessão está em uso por outro navegador. Encerre a outra instância deste sistema e tente novamente.';
    if (/ERR_|navigation.*timeout|net::/i.test(message)) return 'Não foi possível acessar o WhatsApp Web. Confira a conexão de internet e o firewall deste computador.';
    return 'Não foi possível iniciar o WhatsApp. Confira o Chrome instalado e se outra instância está usando a sessão.';
  };
  const browserAlive = () => !!(client?.pupBrowser?.isConnected?.() || (client?.pupPage && !client.pupPage.isClosed?.()));
  const canConnect = () => !starting && !browserAlive() && !['starting','qr','authenticated','syncing','ready'].includes(state.status);
  const canDisconnect = () => !!client && state.status !== 'disconnected' && (browserAlive() || !['error'].includes(state.status));
  async function refreshStatus() {
    if (client?.pupPage?.isClosed?.() && state.status !== 'disconnected') { ++generation; starting = null; clearTimeout(startupTimer); state = { status:'disconnected', qr:null, error:'A conexão do WhatsApp foi encerrada.' }; }
    if (!client?.pupPage || state.status === 'disconnected') return { ...state, canConnect: canConnect(), canDisconnect: canDisconnect() };
    if (probing) { await probing; return { ...state, canConnect: canConnect(), canDisconnect: canDisconnect() }; }
    const current = generation, active = client;
    probing = (async () => {
      try {
        const { inspectWhatsAppConnection, readChatSummaries } = require('./whatsapp-compat');
        const connection = await active.pupPage.evaluate(inspectWhatsAppConnection);
        if (current !== generation) return;
        if (connection.connected && connection.readable) {
          if (!connection.bridgeReady) {
            await active.pupPage.evaluate(require('whatsapp-web.js/src/util/Injected/Utils').LoadUtils);
          }
          const verified = await active.pupPage.evaluate(inspectWhatsAppConnection);
          const summaries = await active.pupPage.evaluate(readChatSummaries);
          if (current !== generation) return;
          if (verified.connected && verified.bridgeReady && Array.isArray(summaries)) {
            clearTimeout(startupTimer);
            state = { status:'ready', qr:null, error:null };
          } else state = { status:'syncing', qr:null, error:'WhatsApp vinculado. Preparando acesso às conversas no painel.' };
        } else if (state.status === 'ready' && !connection.connected) {
          state = { status:'syncing', qr:null, error:'Aguardando o WhatsApp restabelecer a conexão.' };
        }
      } catch {
        if (current === generation && browserAlive()) state = { status:'syncing', qr:null, error:'Sessão aberta. A integração ainda não conseguiu acessar as conversas. [WA_BRIDGE_PENDING]' };
      }
    })().finally(() => { probing = null; });
    await probing;
    return { ...state, canConnect: canConnect(), canDisconnect: canDisconnect() };
  }
  const requireReady = () => {
    if (state.status !== 'ready' || !client) throw Object.assign(new Error('Conecte o WhatsApp antes de continuar.'), { status: 409 });
    return client;
  };
  return {
    status: () => ({ ...state, canConnect: canConnect(), canDisconnect: canDisconnect() }),
    refreshStatus,
    async connect() {
      if (starting || !canConnect()) return;
      clearTimeout(startupTimer);
      const current = ++generation;
      state = { status: 'starting', qr: null, error: null };
      try {
        if (client) { await client.destroy(); client = null; }
        const options = {
          // Do not serve an old cached WhatsApp HTML or impersonate Chrome 101.
          webVersionCache: { type: 'none' },
          userAgent: false,
          authTimeoutMs: 60000,
          puppeteer: {
            headless: process.env.WHATSAPP_SHOW_BROWSER !== 'true',
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
          state = { status: 'error', qr: null, error: 'A inicialização do WhatsApp demorou demais. Reinicie o servidor; se persistir, defina WHATSAPP_SHOW_BROWSER=true no .env para verificar a janela. A sessão salva foi preservada.' };
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
          if (generation === current) { clearTimeout(startupTimer); state = { status: browserAlive() ? 'syncing' : 'error', qr: null, error: browserAlive() ? 'WhatsApp aberto. Recuperando o acesso ao atendimento do painel…' : failureMessage(error) }; }
        }).finally(() => { if (generation === current) starting = null; });
      } catch(error) {
        clearTimeout(startupTimer);
        starting = null;
        state = { status: 'error', qr: null, error: failureMessage(error) };
      }
    },
    async disconnect() {
      if (!canDisconnect()) return;
      clearTimeout(startupTimer);
      ++generation;
      starting = null;
      const old = client;
      client = null;
      state = { status: 'disconnected', qr: null, error: null };
      if (old) { try { await old.logout(); } finally { await old.destroy(); } }
    },
    async chats() {
      const current = requireReady();
      let chats;
      const fromLibrary = async () => (await current.getChats()).map(c => ({ id: c.id._serialized, name: c.name,
        unread: c.unreadCount || 0, timestamp: c.timestamp || 0,
        preview: c.lastMessage?.body || (c.lastMessage?.hasMedia ? '[Anexo]' : ''), archived: !!c.archived }));
      if (current.pupPage) {
        try { chats = await current.pupPage.evaluate(require('./whatsapp-compat').readChatSummaries); }
        catch { chats = await fromLibrary(); }
      } else chats = await fromLibrary();
      return chats.filter(c => /^\d{5,20}@(c\.us|lid)$/.test(c.id))
        .sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0,200);
    },
    async messages(id) {
      const current = requireReady();
      let chat;
      try { chat = await current.getChatById(id); }
      catch(error) {
        if (!current.pupPage) throw error;
        // Chat.fetchMessages retrieves the raw chat, avoiding the broken summary serializer.
        chat = new (require('whatsapp-web.js').Chat)(current, { id: { _serialized: id }, isGroup: false });
      }
      if (!chat) throw Object.assign(new Error('Conversa não encontrada.'), { status: 404 });
      return (await chat.fetchMessages({ limit: 80 })).map(m => ({ id: m.id._serialized, body: m.body,
        fromMe: m.fromMe, timestamp: m.timestamp, hasMedia: m.hasMedia, type: m.type, ack: m.ack }));
    },
    async resolve(phone) {
      let digits = phone.replace(/\D/g,'');
      if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
      if (!/^\d{10,15}$/.test(digits)) throw Object.assign(new Error('Informe um número com DDD ou código do país.'), { status: 400 });
      const result = await requireReady().getNumberId(digits);
      if (!result) throw Object.assign(new Error('Número não encontrado no WhatsApp.'), { status: 404 });
      return { id: result._serialized, name: digits, unread: 0, timestamp: 0, preview: '', desk: {} };
    },
    async media(id, messageId) {
      const message = await requireReady().getMessageById(messageId);
      if (!message || ![message.from, message.to].includes(id)) throw Object.assign(new Error('Anexo não encontrado.'), { status: 404 });
      const media = await message.downloadMedia();
      if (!media || !media.data || media.data.length > 16 * 1024 * 1024) throw new Error('Anexo indisponível ou grande demais.');
      return media;
    },
    async sendMedia(id, data, mimetype, filename, caption, voice = false) {
      const { MessageMedia } = require('whatsapp-web.js');
      const result = await requireReady().sendMessage(id, new MessageMedia(mimetype, data.toString('base64'), filename), { caption, sendSeen: false, sendAudioAsVoice: voice });
      return { id: result.id._serialized };
    },
    async send(id, body, quotedMessageId) {
      const current = requireReady();
      if (quotedMessageId) {
        const quoted = await current.getMessageById(quotedMessageId);
        if (!quoted || ![quoted.from,quoted.to,quoted.id?.remote?._serialized||quoted.id?.remote].includes(id))
          throw Object.assign(new Error('A mensagem citada não pertence a esta conversa.'), { status: 400 });
      }
      const result = await current.sendMessage(id, body, { sendSeen: false, ...(quotedMessageId ? { quotedMessageId } : {}) });
      return { id: result.id._serialized };
    }
  };
}
module.exports = { createWhatsAppService };
