const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {EventEmitter}=require('node:events');
const express=require('express');
const {createWhatsAppService}=require('../whatsapp-service');
const {readChatSummaries}=require('../whatsapp-compat');
const {createDeskStore}=require('../whatsapp-desk-store');
const {createFlorzinha}=require('../florzinha');
const routes=require('../whatsapp-routes');
const id='5511999999999@c.us',lid='123456789012345@lid';
test('Listagem recupera de erro global e lê contatos LID sem serializar grupos',async()=>{
  const client=new EventEmitter();let serialized=false;
  const models=[{id:{_serialized:id},formattedTitle:'Ana',unreadCount:2,t:12,msgs:{getModelsArray:()=>[{body:'Olá',t:12}]}},{id:{_serialized:'12345@g.us'},serialize:()=>{serialized=true;throw Error('bad group')}},{id:{_serialized:lid},name:'Contato privado',t:13}];
  client.initialize=async()=>{};client.destroy=async()=>{};client.logout=async()=>{};client.getChats=async()=>{throw Error('group serialization failed')};
  client.pupPage={evaluate:async fn=>JSON.parse(JSON.stringify(vm.runInNewContext('('+fn.toString()+')()',{window:{require:()=>({Chat:{getModelsArray:()=>models}})}})))};
  const service=createWhatsAppService({clientFactory:()=>client});await service.connect();client.emit('ready');
  const list=await service.chats();assert.deepEqual(list.map(c=>c.id),[lid,id]);assert.equal(list[1].preview,'Olá');assert.equal(serialized,false);await service.disconnect();
});
test('Notas e responsáveis persistem após recarregar e gravações concorrentes não se perdem',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'wa-desk-'));const file=path.join(dir,'desk.json');
  try{const store=createDeskStore(file);await Promise.all([store.update(id,{notes:'Prefere rosas'}),store.update(id,{assignedTo:'Maria'}),store.update(lid,{status:'open'})]);const data=await createDeskStore(file).all();assert.equal(data[id].notes,'Prefere rosas');assert.equal(data[id].assignedTo,'Maria');assert.equal(data[lid].status,'open');assert.equal(data[id].history.length,2);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Florzinha exige chave e gera sugestão sem enviar mensagens ou armazenar conversa no provedor',async()=>{
  let calls=0,requestBody;
  const missing=createFlorzinha({key:()=>'',fetcher:async()=>{calls++}});await assert.rejects(missing.suggest([{body:'oi'}]),/FLORZINHA_API_KEY/);assert.equal(calls,0);
  const ai=createFlorzinha({key:()=> 'fake-test-key',fetcher:async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');requestBody=JSON.parse(options.body);return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:'Olá! Qual é a ocasião do presente?'}]}]})}}});
  assert.match(await ai.suggest([{fromMe:false,body:'Quero flores'}]),/ocasião/);assert.equal(requestBody.store,false);assert.match(requestBody.instructions,/Florzinha/);assert.equal(requestBody.input[0].role,'user');assert.equal(calls,1);
  const failed=createFlorzinha({key:()=> 'fake-test-key',fetcher:async()=>({ok:false,status:401})});await assert.rejects(failed.suggest([{body:'oi'}]),/chave.*não foi aceita/);
});
test('Rotas do atendimento validam dados, anexos, LID e habilitação explícita da IA',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'wa-routes-'));const desk=createDeskStore(path.join(dir,'desk.json'));let suggestions=0,sends=0,historyReads=0;
  const service={status:()=>({status:'ready',qr:null,error:null}),chats:async()=>[{id:lid,name:'Cliente'}],messages:async()=>{historyReads++;return [{body:'Oi',fromMe:false}]},send:async()=>{sends++;return{id:'sent'}},sendMedia:async(chat,data,mime,filename)=>{assert.equal(chat,lid);assert.equal(data.toString(),'PDF');assert.equal(mime,'application/pdf');assert.doesNotMatch(filename,/[/\\]/);sends++;return{id:'media'}}};
  const ai={configured:()=>true,suggest:async()=>{suggestions++;return 'Olá!'}};
  const app=express();app.use(express.json());app.use('/wa',(req,res,next)=>req.headers.authorization==='Bearer test'?next():res.sendStatus(401),routes(service,desk,ai));const server=app.listen(0);await new Promise(r=>server.once('listening',r));
  const headers={Authorization:'Bearer test','Content-Type':'application/json'};const url='http://127.0.0.1:'+server.address().port+'/wa';const chat='/chats/'+encodeURIComponent(lid);
  try{
    assert.equal((await fetch(url+chat+'/suggestion',{method:'POST'})).status,401);
    assert.equal((await fetch(url+chat+'/suggestion',{method:'POST',headers})).status,409);assert.equal(historyReads,0);assert.equal(suggestions,0);
    assert.equal((await fetch(url+chat+'/desk',{method:'PATCH',headers,body:JSON.stringify({aiEnabled:true,notes:'Notas privadas',status:'open'})})).status,200);
    const list=await(await fetch(url+'/chats',{headers})).json();assert.equal(list[0].desk.notes,'Notas privadas');
    assert.equal((await fetch(url+chat+'/suggestion',{method:'POST',headers})).status,200);assert.equal(suggestions,1);assert.equal(sends,0);
    assert.equal((await fetch(url+chat+'/desk',{method:'PATCH',headers,body:JSON.stringify({status:'unknown'})})).status,400);
    assert.equal((await fetch(url+'/chats/12345%40g.us/messages',{headers})).status,400);
    const binary={Authorization:'Bearer test','Content-Type':'application/octet-stream'};
    assert.equal((await fetch(url+chat+'/media?mime=text/html',{method:'POST',headers:binary,body:'<script>'})).status,400);
    assert.equal((await fetch(url+chat+'/media?mime=application/pdf&filename=../../teste.pdf',{method:'POST',headers:binary,body:'PDF'})).status,201);assert.equal(sends,1);
    assert.equal((await fetch(url+chat+'/media?mime=application/pdf',{method:'POST',headers:binary,body:Buffer.alloc(8*1024*1024+1)})).status,413);
  }finally{await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
});
test('Download de anexo não pode recuperar mensagem de outra conversa',async()=>{const client=new EventEmitter();client.initialize=async()=>{};client.getMessageById=async()=>({from:'5511888888888@c.us',to:'5511777777777@c.us',downloadMedia:async()=>{throw Error('must not download')}});const service=createWhatsAppService({clientFactory:()=>client});await service.connect();client.emit('ready');await assert.rejects(service.media(id,'private-message'),{status:404});});
