const express = require('express');
const { z } = require('zod');
function whatsappRoutes(service) {
  const router = express.Router();
  router.use((req,res,next) => { res.set('Cache-Control','no-store'); next(); });
  router.get('/status', (req,res) => res.json(service.status()));
  router.post('/connect', async (req,res,next) => { try { await service.connect(); res.status(202).json(service.status()); } catch(e) { next(e); } });
  router.post('/disconnect', async (req,res,next) => { try { await service.disconnect(); res.json(service.status()); } catch(e) { next(e); } });
  router.get('/chats', async (req,res,next) => { try { res.json(await service.chats()); } catch(e) { next(e); } });
  router.use('/chats/:id', (req,res,next) => {
    if (!/^\d{5,20}@c\.us$/.test(req.params.id)) return res.status(400).json({ error: 'Conversa individual inválida.' });
    next();
  });
  router.get('/chats/:id/messages', async (req,res,next) => { try { res.json(await service.messages(req.params.id)); } catch(e) { next(e); } });
  router.post('/chats/:id/messages', async (req,res,next) => {
    const parsed = z.object({ body: z.string().trim().min(1).max(4000) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Escreva uma mensagem de até 4.000 caracteres.' });
    try { res.status(201).json(await service.send(req.params.id, parsed.data.body)); } catch(e) { next(e); }
  });
  router.use((err,req,res,next) => {
    if (err.status === 409) return res.status(409).json({ error: err.message });
    const messages = {
      chats: ['WA_CHATS_FAILED', 'Não foi possível carregar as conversas. A sessão pode continuar conectada; tente Atualizar conversas.'],
      messages: ['WA_MESSAGES_FAILED', 'Não foi possível carregar as mensagens desta conversa.'],
      send: ['WA_SEND_FAILED', 'Não foi possível confirmar o envio. Confira a conversa no celular antes de reenviar.'],
      disconnect: ['WA_DISCONNECT_FAILED', 'Não foi possível confirmar a desconexão. Confira Aparelhos conectados no celular.'],
      connect: ['WA_CONNECT_FAILED', 'Não foi possível iniciar a conexão.']
    };
    const operation = req.path.endsWith('/messages') ? (req.method === 'POST' ? 'send' : 'messages') : req.path.split('/').pop();
    const [code, error] = messages[operation] || ['WA_UNAVAILABLE', 'WhatsApp indisponível.'];
    // Only known API names/categories: never return raw exception text, QR, phone or session data.
    const raw = String(err.message || '');
    const api = raw.match(/\b(getChatModel|getChats|getContactModel|getContact|isReadOnly|findImpl|getIsMyContact|markedUnread)\b/);
    const diagnostic = /target closed|session closed|browser.*disconnected/i.test(raw) ? 'BROWSER_CLOSED'
      : /execution context.*destroyed|detached.*frame/i.test(raw) ? 'PAGE_RELOADING'
      : /timeout/i.test(raw) ? 'TIMEOUT'
      : api ? 'WEB_API_' + api[1]
      : /evaluation failed|is not a function|cannot read properties/i.test(raw) ? 'WEB_API_ERROR'
      : 'UNCLASSIFIED';
    console.error('WhatsApp: ' + code + ' (' + diagnostic + ')');
    res.status(503).json({ error, code, diagnostic });
  });
  return router;
}
module.exports = whatsappRoutes;
