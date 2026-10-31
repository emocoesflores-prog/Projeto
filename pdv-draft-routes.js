const {z}=require('zod');
module.exports=function(app,{drafts,tenantId,platformStore,orders,multi}){
 const owner=req=>req.account?.user.id||'00000000-0000-4000-8000-000000000001';
 const id=req=>{if(!z.uuid().safeParse(req.params.id).success)throw Object.assign(Error('Rascunho inválido.'),{status:400});return req.params.id.toLowerCase();};
 const route=fn=>async(req,res,next)=>{try{res.json(await fn(req));}catch(e){next(e);}};
 app.get('/api/admin/pdv-drafts',route(req=>drafts.list(tenantId(),owner(req))));
 app.get('/api/admin/pdv-drafts/:id',route(async req=>{const record=await drafts.get(tenantId(),owner(req),id(req));if(!record||record.state!=='active')throw Object.assign(Error('Rascunho não encontrado.'),{status:404});return record;}));
 app.put('/api/admin/pdv-drafts/:id',route(req=>drafts.save(tenantId(),owner(req),id(req),req.body)));
 app.delete('/api/admin/pdv-drafts/:id',route(req=>drafts.close(tenantId(),owner(req),id(req),req.body)));
 app.post('/api/admin/pdv-drafts/:id/complete',route(async req=>{const key=id(req),order=multi?await platformStore.registration(tenantId(),key,{demoOrders:orders}):(await orders.list()).find(o=>o.registration?.id?.toLowerCase()===key);if(!order)throw Object.assign(Error('Registre o pedido antes de encerrar o rascunho.'),{status:409});return drafts.close(tenantId(),owner(req),key,req.body,order.id);}));
};
