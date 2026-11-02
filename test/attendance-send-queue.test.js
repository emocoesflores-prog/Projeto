const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),{randomUUID}=require('node:crypto'),{EventEmitter}=require('node:events');
test('HTTP: dois atendentes recebem aceite imediato; mesma conta transmite uma vez por vez e mantém destinatários',async()=>{
 const tenant=randomUUID(),actors=[{id:randomUUID(),name:'Ana',role:'owner',active:true},{id:randomUUID(),name:'Bruno',role:'staff',active:true}],store=require('../conversation-store').createStore({demo:true});
 let clock=Date.parse('2026-11-02T15:00Z'),active=0,maximum=0,release;const hold=new Promise(resolve=>release=resolve),sent=[],client=new EventEmitter();
 const policy=require('../outbound-care').createOutboundCare({now:()=>clock,random:min=>min,sleep:async ms=>{clock+=ms;}});
 Object.assign(client,{initialize:async()=>{},destroy:async()=>{},getChatById:async()=>({sendStateTyping:async()=>{},clearState:async()=>{},fetchMessages:async()=>[]}),sendMessage:async(id,body)=>{active++;maximum=Math.max(maximum,active);if(!sent.length)await hold;sent.push({id,body,at:clock});active--;return {id:{_serialized:randomUUID()}};}});
 const service=require('../whatsapp-service').createWhatsAppService({clientFactory:()=>client,sendPolicy:policy});await service.connect();client.emit('ready');
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.account={user:actors[Number(req.headers['x-test-actor']||0)]};req.validateSession=async()=>req.account.user.active;next();});
 const resources={get:async()=>({service,desk:{all:async()=>({})}})},platformStore={team:async()=>actors,tenant:async()=>({profile:{}})},attendance=require('../attendance-routes').createAttendance({multi:true,tenantId:()=>tenant,platformStore,customers:{},orders:{},resources,channels:{},conversations:store,customerInfo:{}});
 attendance.register(app);app.use('/api/admin/whatsapp',attendance.guard,require('../whatsapp-routes')(service,{},{}));app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message,notSent:!!error.notSent}));
 const server=app.listen(0),base='http://127.0.0.1:'+server.address().port;
 async function api(path,body,actor=0,operationId){const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Test-Actor':String(actor),...(operationId?{'X-Operation-Id':operationId}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json()};}
 const chats=['5511988887777@c.us','5511977776666@c.us'],operations=[randomUUID(),randomUUID()];
 try{
  for(let i=0;i<2;i++)await store.mutate(tenant,'whatsapp',chats[i],{action:'claim',version:0},actors[i],{team:actors});
  const results=await Promise.all(chats.map((id,i)=>api('/api/admin/whatsapp/chats/'+encodeURIComponent(id)+'/messages',{body:'Resposta de '+actors[i].name},i,operations[i])));
  assert.ok(results.every(result=>result.status===202));assert.equal(maximum,1);assert.equal(sent.length,0);assert.equal((await api('/api/admin/attendance/outbox')).data.messages.length,2);
  await assert.rejects(store.mutate(tenant,'whatsapp',chats[0],{action:'assign',version:1,userId:actors[1].id},actors[0],{team:actors}),/envio/);
  release();for(let i=0;i<100;i++){if((await store.sendStatus(tenant,'whatsapp',chats[1],operations[1])).state==='sent')break;await new Promise(resolve=>setTimeout(resolve,2));}
  assert.equal(maximum,1);assert.deepEqual(sent.map(value=>[value.id,value.body]),[[chats[0],'Resposta de Ana'],[chats[1],'Resposta de Bruno']]);assert.ok(sent[1].at-sent[0].at>=8000);
  assert.equal((await api('/api/admin/attendance/whatsapp/chats/'+encodeURIComponent(chats[1])+'/sends/'+operations[1],undefined,1)).data.state,'sent');
  assert.equal((await api('/api/admin/attendance/whatsapp/chats/'+encodeURIComponent(chats[0])+'/sends/'+operations[1])).status,404);
  const replay=await api('/api/admin/whatsapp/chats/'+encodeURIComponent(chats[0])+'/messages',{body:'Resposta de Ana'},0,operations[0]);assert.equal(replay.data.replayed,true);assert.equal(sent.length,2);
  const link=await api('/api/admin/whatsapp/chats/'+encodeURIComponent(chats[0])+'/messages',{body:'Veja https://exemplo.com'},0,randomUUID());assert.equal(link.status,422);assert.equal(sent.length,2);
 }finally{release();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await service.close();}
});
