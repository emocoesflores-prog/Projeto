const {test}=require('node:test'),assert=require('node:assert/strict');
process.env.AUTH_MODE='multi';process.env.DATA_MODE='demo';process.env.ADMIN_TOKEN='platform-test-setup-key-never-production';
const app=require('../server');
test('Plataforma: login, lojas isoladas, administração principal, nomes de IA e suspensão',async()=>{
 const server=app.listen(0);await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 async function api(path,body,session,method=body===undefined?'GET':'POST',extra={}){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await r.json();return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 async function login(username,password){const management=username.replace(/\D/g,'')==='53770070000195';const r=await api('/api/auth'+(management?'/management':'')+'/login',{username,password});assert.equal(r.status,200,JSON.stringify(r.data));assert.ok(r.cookie);return {...r.data,cookie:r.cookie};}
 try{
  assert.equal((await api('/api/admin/orders')).status,401);assert.equal((await api('/api/admin/orders',undefined,null,'GET',{Authorization:'Bearer '+process.env.ADMIN_TOKEN})).status,401);
  const originalKey=process.env.ADMIN_TOKEN;
  for(const key of ['', 'short-key']){
   process.env.ADMIN_TOKEN=key;
   const invalid=await api('/api/auth/bootstrap',{setupKey:key||'any-key',name:'Administrador Teste',username:'53770070000195',password:'senha-forte-principal'});
   assert.equal(invalid.status,503);assert.match(invalid.data.error,/mínimo 16 caracteres/);
   assert.equal((await api('/api/auth/state')).data.setupRequired,true);
  }
  process.env.ADMIN_TOKEN=originalKey;
  assert.equal((await api('/api/auth/bootstrap',{setupKey:'wrong',name:'Administrador Teste',username:'53.770.070/0001-95',password:'senha-forte-principal'})).status,401);
  assert.equal((await api('/api/auth/bootstrap',{setupKey:process.env.ADMIN_TOKEN,name:'Administrador Teste',username:'53.770.070/0001-95',password:'senha-forte-principal'})).status,201);
  assert.equal((await api('/api/auth/bootstrap',{setupKey:process.env.ADMIN_TOKEN,name:'Outro Administrador',username:'outro',password:'senha-forte-principal'})).status,409);
  assert.equal((await api('/api/auth/login',{username:'53.770.070/0001-95',password:'errada'})).status,401);
  const master=await login('53.770.070/0001-95','senha-forte-principal');assert.equal(master.role,'master');assert.equal(master.username,'53770070000195');await login('53770070000195','senha-forte-principal');assert.doesNotMatch(JSON.stringify(master),/passwordHash|setupKey/);assert.equal(master.tenant.name,'Inova Facil Consultoria e Solucoes em Tecnologia Ltda - ME');assert.equal((await api('/api/admin/orders',undefined,master)).status,401);const original='00000000-0000-4000-8000-000000000001';assert.equal((await api('/api/platform/tenants/'+original+'/access',{name:'Responsável Emoções Flores',username:'emocoes',password:'senha-da-loja-original'},master)).status,201);const emocoes=await login('emocoes','senha-da-loja-original');
  assert.equal((await api('/api/auth/login',{username:'53770070000195',password:'senha-forte-principal'})).status,403);assert.equal((await api('/api/auth/management/login',{username:'emocoes',password:'senha-da-loja-original'})).status,403);
  const both=master.cookie+'; '+emocoes.cookie;assert.equal((await api('/api/auth/me',undefined,{cookie:both})).data.role,'owner');assert.equal((await api('/api/auth/management/me',undefined,{cookie:both})).data.role,'master');
  const make=(slug,name,username,assistantName)=>({name,slug,ownerName:'Responsável '+name,username,password:'senha-inicial-forte',profile:{assistantName,phone:'11987654321',email:'',document:'',address:'Rua de Teste, 100',city:'Mauá',state:'SP',pickupAddress:'Rua de Teste, 100',deliveryFee:1000}});
  const a=await api('/api/platform/tenants',make('rosas-ana','Floricultura Rosas da Ana','ana','Rosinha'),master);assert.equal(a.status,201);
  const biaData=make('flores-bia','Floricultura Flores da Bia','bia','Violeta');biaData.profile.city='Curitiba';biaData.profile.state='PR';const b=await api('/api/platform/tenants',biaData,master);assert.equal(b.status,201);assert.notEqual(a.data.id,b.data.id);
  const ana=await login('ana','senha-inicial-forte'),bia=await login('bia','senha-inicial-forte');
  assert.equal((await api('/api/platform/tenants',undefined,ana)).status,401);assert.equal((await api('/api/platform/tenants/'+b.data.id,{active:false},ana,'PATCH')).status,401);
  assert.equal((await api('/api/admin/store-settings',{deliveryFee:9000},{cookie:ana.cookie,csrf:'wrong'},'PUT')).status,403);
  const customer={name:'Cliente Compartilhado',phone:'11981112222'};const ca=await api('/api/admin/customers',customer,ana),cb=await api('/api/admin/customers',customer,bia);assert.equal(ca.status,201);assert.equal(cb.status,201);assert.notEqual(ca.data.id,cb.data.id);
  const address={label:'Casa',zipCode:'80010000',street:'Rua das Flores',number:'100',neighborhood:'Centro',city:'Curitiba',state:'PR',recipient:'Destinatária Bia',recipientPhone:'11981112222'};const ba=await api('/api/admin/customers/'+cb.data.id+'/addresses',address,bia);assert.equal(ba.status,201,JSON.stringify(ba.data));assert.equal((await api('/api/admin/customers/'+ca.data.id+'/addresses',address,ana)).status,400);
  assert.equal((await api('/api/admin/customers/'+ca.data.id,undefined,bia)).status,404);
  assert.equal((await api('/api/admin/customers/'+ca.data.id+'/addresses',undefined,bia)).status,404);
  const search=await api('/api/admin/customers?q=Cliente',undefined,ana);assert.equal(search.data.length,1);assert.equal(search.data[0].id,ca.data.id);
  await api('/api/admin/store-settings',{deliveryFee:3500},ana,'PUT');assert.equal((await api('/api/store-settings',undefined,ana)).data.deliveryFee,3500);assert.equal((await api('/api/store-settings',undefined,bia)).data.deliveryFee,1000);
  const order={customer:'Cliente da Ana',phone:'11981112222',recipient:'Presenteada',fulfillment:'pickup',scheduleMode:'scheduled',date:'2099-01-01',period:'Tarde',timeSlot:'13:40 - 15:20',paymentMethod:'pix',items:[{id:1,quantity:1}],tenantId:b.data.id};
  const oa=await api('/api/orders?store=rosas-ana',order);assert.equal(oa.status,201,JSON.stringify(oa.data));assert.equal((await api('/api/admin/orders',undefined,ana)).data.length,1);assert.equal((await api('/api/admin/orders?store=rosas-ana',undefined,bia,'GET',{'X-Tenant-Id':a.data.id})).data.length,0);
  assert.equal((await api('/api/admin/orders/'+oa.data.id,{action:'cancel',version:0,reason:'Teste'},bia,'PATCH')).status,404);
  assert.equal((await api('/api/admin/assistant-settings',undefined,ana)).data.assistantName,'Rosinha');await api('/api/admin/assistant-settings',{assistantName:'Dália'},ana,'PUT');assert.equal((await api('/api/admin/assistant-settings',undefined,bia)).data.assistantName,'Violeta');assert.equal((await api('/api/admin/assistant-settings',undefined,emocoes)).data.assistantName,'Florzinha');
  assert.equal((await fetch(base+'/painel/rosas-ana')).status,200);assert.equal((await fetch(base+'/painel/inexistente')).status,404);assert.equal((await fetch(base+'/loja/rosas-ana')).status,200);assert.equal((await api('/api/auth/login',{username:'ana',password:'senha-inicial-forte',store:'flores-bia'})).status,403);assert.equal((await api('/api/admin/orders',undefined,ana,'GET',{'X-Store-Slug':'flores-bia'})).status,401);
  const profileA=(await api('/api/store-settings?store=rosas-ana')).data;assert.equal(profileA.name,'Floricultura Rosas da Ana');assert.equal(profileA.assistantName,'Dália');assert.equal((await api('/api/store-settings?store=missing')).status,404);
  const reset=await api('/api/platform/tenants/'+a.data.id+'/password',{password:'outra-senha-inicial'},master);assert.equal(reset.status,200);assert.equal((await api('/api/admin/orders',undefined,ana)).status,401);assert.equal((await api('/api/auth/login',{username:'ana',password:'senha-inicial-forte'})).status,401);const ana2=await login('ana','outra-senha-inicial');
  assert.equal((await api('/api/platform/tenants/'+a.data.id,{active:false},master,'PATCH')).status,200);assert.equal((await api('/api/admin/orders',undefined,ana2)).status,401);assert.equal((await api('/api/store-settings?store=rosas-ana')).status,404);assert.equal((await api('/api/admin/orders',undefined,bia)).status,200);
  assert.equal((await api('/api/auth/management/logout',{},master)).status,200);assert.equal((await api('/api/auth/management/me',undefined,master)).status,401);assert.equal((await api('/api/auth/me',undefined,emocoes)).status,200);
  assert.equal((await api('/api/auth/logout',{},bia)).status,200);assert.equal((await api('/api/admin/orders',undefined,bia)).status,401);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('Senhas usam hash com sal e não são retornadas no cadastro ou sessão',async()=>{const {hashPassword,verifyPassword}=require('../platform-auth');const a=await hashPassword('uma-senha-bem-forte'),b=await hashPassword('uma-senha-bem-forte');assert.notEqual(a,b);assert.equal(await verifyPassword('uma-senha-bem-forte',a),true);assert.equal(await verifyPassword('incorreta',a),false);assert.doesNotMatch(a,/uma-senha-bem-forte/);});
test('IA recebe identidade apenas da loja configurada e não usa os dados fixos da loja original',async()=>{let request;const ai=require('../florzinha').createFlorzinha({key:()=> 'fake',identity:async()=>({assistantName:'Violeta',storeName:'Floricultura Flores da Bia',city:'Curitiba',pickupAddress:'Rua das Flores, 10'}),fetcher:async(url,options)=>{request=JSON.parse(options.body);return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:'Olá, posso ajudar?'}]}]})}}});await ai.suggest([{body:'Olá'}]);assert.match(request.instructions,/Violeta/);assert.match(request.instructions,/Floricultura Flores da Bia/);assert.match(request.instructions,/Curitiba/);assert.doesNotMatch(request.instructions,/Florzinha|Emoções Flores|Havana|Mauá/);});
test('Consultas SQL de leitura e inclusão sempre incluem o identificador da loja',async(t)=>{
 const {createCustomerStore}=require('../customer-store'),{createOrderStore}=require('../order-store');const tenant='a72bc6dc-d34c-4ff8-8a53-7e3a8ebed527',calls=[];
 const pool={request(){const inputs={};return {input(name,type,value){inputs[name]=value;return this;},async query(text){calls.push({text,inputs});return {recordset:[]};}}}};
 const sql=require('mssql');t.mock.method(sql,'Transaction',function(){return {async begin(){},async commit(){},async rollback(){}};});t.mock.method(sql,'Request',function(){return pool.request();});
 const customers=createCustomerStore({demo:false,multi:true,getPool:()=>pool,getTenant:()=>tenant}),orders=createOrderStore({demo:false,multi:true,getPool:()=>pool,getTenant:()=>tenant});
 await customers.search('Ana');await customers.get('db0bc95a-d211-4cbe-9d5c-2b1c623ae338');await customers.insert({name:'Cliente SQL',phone:'11981112222'});await orders.list();await orders.insert({id:'4619025d-4af4-4d54-8d44-dfa137133b72',total:100,status:'Recebido'});
 for(const call of calls){assert.equal(call.inputs.tenantId,tenant);assert.match(call.text,/@tenantId/);if(call.text.startsWith('SELECT'))assert.match(call.text,/WHERE tenantId=@tenantId|AND tenantId=@tenantId/);}
 assert.match(calls[0].text,/tenantId=@tenantId AND \(.* OR /);assert.equal(calls.length,6);
});
test('Recursos e anotações WhatsApp usam arquivos e serviços diferentes mesmo para o mesmo contato',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),express=require('express');const root=await fs.mkdtemp(path.join(os.tmpdir(),'tenant-whatsapp-')),paths=[];
 const manager=require('../tenant-resources').createTenantResources({root,makeService:options=>{paths.push(options.dataPath);return {status:()=>({status:'ready'}),chats:async()=>[{id:'5511999999999@c.us',name:'Contato'}],close:async()=>{}}}});
 let server;try{const a=await manager.get('8b181d91-46d0-43ec-912e-f2b5bf41893e'),b=await manager.get('ee5559d6-b9cb-4a3b-83cd-42f7e738364a');assert.notEqual(a.service,b.service);assert.notEqual(paths[0],paths[1]);assert.ok(paths.every(p=>p.startsWith(root)));const app=express();app.use(express.json());app.use('/a',a.router);app.use('/b',b.router);server=app.listen(0);await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 await fetch(base+'/a/chats/5511999999999%40c.us/desk',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({notes:'Exclusivo da loja A',aiEnabled:true})});const one=await (await fetch(base+'/a/chats')).json(),two=await (await fetch(base+'/b/chats')).json();assert.equal(one[0].desk.notes,'Exclusivo da loja A');assert.deepEqual(two[0].desk,{});
 }finally{await manager.close();if(server)await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});}
});
test('Comando de migração recusa o modo demo antes de tentar alterar qualquer banco',()=>{
 const {spawnSync}=require('node:child_process');const result=spawnSync(process.execPath,['scripts/migrate-platform.js'],{cwd:require('node:path').join(__dirname,'..'),env:{...process.env,DATA_MODE:'demo'},encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/exige DATA_MODE=sqlserver/);assert.doesNotMatch(result.stdout,/Migração da plataforma aplicada/);
});
test('Gestão da Inova, painel da floricultura e site são documentos separados',async()=>{
 const server=app.listen(0);await new Promise(r=>server.once('listening',r));try{const base='http://127.0.0.1:'+server.address().port;
 const management=await (await fetch(base+'/inova.html')).text(),shop=await (await fetch(base+'/admin.html')).text(),site=await (await fetch(base+'/')).text();
 assert.match(management,/id="inova-login"/);assert.match(management,/id="tenant-form"/);assert.doesNotMatch(management,/id="wa-send"|src="\/admin.js/);
 assert.match(shop,/id="wa-send"/);assert.match(shop,/id="new-order"/);assert.doesNotMatch(shop,/id="tenant-form"|id="setup-fields"|src="\/platform.js/);
 assert.match(site,/id="checkout"/);assert.doesNotMatch(site,/id="inova-login"|id="tenant-form"/);
 }finally{await new Promise(r=>server.close(r));}
});
