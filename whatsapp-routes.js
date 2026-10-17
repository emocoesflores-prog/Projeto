const express = require('express');
const { z } = require('zod');
function whatsappRoutes(service, desk = require('./whatsapp-desk-store').createDeskStore(), florzinha = require('./florzinha').createFlorzinha()) {
  const router = express.Router();
  router.use((req,res,next) => { res.set('Cache-Control','no-store'); next(); });
  router.get('/status', async (req,res,next) => { try { const state = service.refreshStatus ? await service.refreshStatus() : service.status(); res.json({ ...state, aiConfigured: florzinha.configured() }); } catch(e) { next(e); } });
  router.post('/connect', async (req,res,next) => { try { await service.connect(); res.status(202).json(service.status()); } catch(e) { next(e); } });
  router.post('/disconnect', async (req,res,next) => { try { await service.disconnect(); res.json(service.status()); } catch(e) { next(e); } });
  router.get('/chats', async (req,res,next) => { try { const metadata = await desk.all(); res.json((await service.chats()).map(chat => ({ ...chat, desk: metadata[chat.id] || {} }))); } catch(e) { next(e); } });
  router.post('/new-chat', async (req,res,next) => {
    const parsed = z.object({phone:z.string().min(8).max(30)}).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({error:'Informe um WhatsApp válido.'});
    try { res.json(await service.resolve(parsed.data.phone)); } catch(e) { next(e); }
  });
  router.use('/chats/:id', (req,res,next) => {
    if (!/^\d{5,20}@(c\.us|lid)$/.test(req.params.id)) return res.status(400).json({ error: 'Conversa individual inválida.' });
    next();
  });
  router.patch('/chats/:id/desk', async (req,res,next) => {
    const parsed = z.object({ status: z.enum(['new','open','done']).optional(), favorite: z.boolean().optional(), aiEnabled: z.boolean().optional(),
      assignedTo: z.string().trim().max(80).optional(), notes: z.string().max(4000).optional(),
      orderId: z.union([z.uuid(),z.literal('')]).optional() }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dados de atendimento inválidos.' });
    try { res.json(await desk.update(req.params.id, parsed.data)); } catch(e) { next(e); }
  });
  router.get('/chats/:id/messages/:messageId/media', async (req,res,next) => {
    if (req.params.messageId.length > 250) return res.sendStatus(400);
    try {
      const media = await service.media(req.params.id, req.params.messageId);
      const filename = String(media.filename || 'anexo').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100);
      const mime = String(media.mimetype||'').split(';')[0];
      const preview = req.query.preview === '1';
      if (preview && !['image/jpeg','image/png','image/webp','image/gif','audio/mpeg','audio/ogg','audio/mp4','audio/webm','video/mp4'].includes(mime))
        return res.status(415).json({error:'Este formato não tem prévia. Use Baixar para abrir o arquivo.'});
      res.set('Content-Type',preview ? mime : 'application/octet-stream');
      res.set('Content-Disposition',(preview?'inline':'attachment')+'; filename="'+filename+'"');
      res.send(Buffer.from(media.data,'base64'));
    } catch(e) { next(e); }
  });
  router.post('/chats/:id/media', express.raw({type:'application/octet-stream',limit:'8mb'}), async (req,res,next) => {
    const mime = String(req.query.mime || '');
    if (!['image/jpeg','image/png','image/webp','application/pdf','audio/mpeg','audio/ogg','audio/mp4','audio/webm','video/mp4'].includes(mime) || !Buffer.isBuffer(req.body) || !req.body.length)
      return res.status(400).json({ error: 'Selecione imagem, PDF, áudio ou vídeo de até 8 MB.' });
    const filename = String(req.query.filename || 'anexo').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100);
    try { res.status(201).json(await service.sendMedia(req.params.id,req.body,mime,filename,'',req.query.voice === '1' && mime.startsWith('audio/'))); } catch(e) { next(e); }
  });
  router.post('/chats/:id/suggestion', async (req,res,next) => {
    try {
      const metadata = await desk.all();
      if (!metadata[req.params.id]?.aiEnabled) return res.status(409).json({ error: 'Habilite a Florzinha nesta conversa antes de gerar uma sugestão.' });
      res.json({ text: await florzinha.suggest(await service.messages(req.params.id)) });
    } catch(e) { next(e); }
  });
  router.get('/chats/:id/messages', async (req,res,next) => { try { res.json(await service.messages(req.params.id)); } catch(e) { next(e); } });
  router.post('/chats/:id/messages', async (req,res,next) => {
    const parsed = z.object({ body: z.string().trim().min(1).max(4000), quotedMessageId: z.string().min(1).max(250).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Escreva uma mensagem de até 4.000 caracteres.' });
    try { res.status(201).json(await service.send(req.params.id, parsed.data.body, parsed.data.quotedMessageId)); } catch(e) { next(e); }
  });
  router.use((err,req,res,next) => {
    if (err.publicError) return res.status(err.status).json({error:err.message});
    if ([400,404,409].includes(err.status)) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'O arquivo deve ter no máximo 8 MB.' });
    const messages = {
      suggestion: ['FLORZINHA_FAILED', 'Não foi possível gerar a sugestão da Florzinha. Tente novamente.'],
      desk: ['WA_DESK_FAILED', 'Não foi possível salvar os dados do atendimento.'],
      media: ['WA_MEDIA_FAILED', 'Não foi possível transferir o anexo. Confira no celular antes de reenviar.'],
      chats: ['WA_CHATS_FAILED', 'Não foi possível carregar as conversas. A sessão pode continuar conectada; tente Atualizar conversas.'],
      messages: ['WA_MESSAGES_FAILED', 'Não foi possível carregar as mensagens desta conversa.'],
      send: ['WA_SEND_FAILED', 'Não foi possível confirmar o envio. Confira a conversa no celular antes de reenviar.'],
      disconnect: ['WA_DISCONNECT_FAILED', 'Não foi possível confirmar a desconexão. Confira Aparelhos conectados no celular.'],
      connect: ['WA_CONNECT_FAILED', 'Não foi possível iniciar a conexão.']
    };
    const operation = req.path.endsWith('/messages') ? (req.method === 'POST' ? 'send' : 'messages') : req.path.split('/').pop();
    const [code, error] = messages[operation] || ['WA_UNAVAILABLE', 'WhatsApp indisponível.'];
    // Only known API names/categories: never return raw exception text, QR, phone or session data.
    const raw = String(err?.message || err || '');
    const api = raw.match(/\b(getChatModel|getMessageModel|getChats|getContactModel|getContact|isReadOnly|findImpl|getIsMyContact|markedUnread)\b/);
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
