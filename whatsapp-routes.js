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
  router.use((err,req,res,next) => res.status(err.status === 409 ? 409 : 503).json({ error: err.status === 409 ? err.message : 'WhatsApp indisponível. Confira a conexão antes de tentar novamente.' }));
  return router;
}
module.exports = whatsappRoutes;
