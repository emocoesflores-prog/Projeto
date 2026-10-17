const {test}=require('node:test'),assert=require('node:assert/strict');
const {access,change,day}=require('../finance');
test('Vencimento usa o dia de Brasília, não bloqueia antes do prazo e preserva histórico',()=>{
 const tenant={profile:{billing:{enabled:true,blockPanel:true,blockSite:false,charges:[{status:'pending',dueDate:'2026-10-17',amount:10000}]}}};
 assert.equal(access(tenant,'2026-10-17').blocked,false);assert.equal(access(tenant,'2026-10-18').blocked,true);assert.equal(access(tenant,'2026-10-18').blockSite,false);
 const first=change(undefined,{action:'charge',description:'Mensalidade de teste',amount:15000,dueDate:'2026-10-16'},'gestor');const id=first.charges[0].id;
 const paid=change(first,{action:'pay',id,paidDate:day(),method:'pix',note:'Conferido'},'gestor');assert.equal(first.charges[0].status,'pending');assert.equal(paid.charges[0].status,'paid');assert.equal(paid.history.length,2);assert.equal(paid.charges[0].confirmedBy,'gestor');
 const cancelled=change(first,{action:'cancel',id,reason:'Cobrança lançada em duplicidade'},'gestor');assert.equal(cancelled.charges[0].status,'cancelled');assert.equal(cancelled.history.length,2);assert.equal(access({profile:{billing:cancelled}},'2099-01-01').blocked,false);
 const disabled=change(first,{action:'configure',enabled:false,blockPanel:true,blockSite:true},'gestor');assert.equal(access({profile:{billing:disabled}},'2099-01-01').blocked,false);
 assert.throws(()=>change(paid,{action:'pay',id,paidDate:day(),method:'pix'},'gestor'),/já foi paga/);
 assert.throws(()=>change(first,{action:'configure',enabled:true,blockPanel:false,blockSite:false},'gestor'),/pelo menos uma área/);
});
process.env.AUTH_MODE='multi';process.env.DATA_MODE='demo';process.env.ADMIN_TOKEN='finance-test-configuration-key';
const app=require('../server');
test('Financeiro isola lojas, aplica três escopos, libera após quitação e protege confirmações',async()=>{
 const server=app.listen(0);await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 async function api(path,body,session,method=body===undefined?'GET':'POST'){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
 async function login(username,password,management=false){const r=await api('/api/auth/'+(management?'management/':'')+'login',{username,password});assert.equal(r.status,200,JSON.stringify(r.data));return {...r.data,cookie:r.cookie};}
 try{
  await api('/api/auth/bootstrap',{setupKey:process.env.ADMIN_TOKEN,name:'Gestor Inova',username:'gestor',password:'senha-principal-financeira'});const master=await login('gestor','senha-principal-financeira',true);
  const create=async(slug,user)=>(await api('/api/platform/tenants',{name:'Floricultura '+slug,slug,ownerName:'Dono '+slug,username:user,password:'senha-da-floricultura',profile:{assistantName:'Assistente',city:'Mauá',deliveryFee:1000}},master)).data;
  const a=await create('loja-financeira-a','dona-a'),b=await create('loja-financeira-b','dona-b'),owner=await login('dona-a','senha-da-floricultura'),other=await login('dona-b','senha-da-floricultura');
  const path='/api/platform/tenants/'+a.id+'/finance',yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
  assert.equal((await api('/api/platform/finance',undefined,owner)).status,401);assert.equal((await api(path,{action:'charge',description:'Tentativa',amount:100,dueDate:yesterday},owner)).status,401);
  assert.equal((await api(path,{action:'charge',description:'Sem CSRF',amount:100,dueDate:yesterday},{...master,csrf:'wrong'})).status,403);
  const charge=await api(path,{action:'charge',description:'Mensalidade A',amount:15000,dueDate:yesterday},master);assert.equal(charge.status,200);const id=charge.data.billing.charges[0].id;assert.equal(charge.data.access.blocked,true);
  assert.equal((await api('/api/auth/me',undefined,owner)).status,403);assert.equal((await api('/api/admin/orders',undefined,owner)).status,403);assert.equal((await api('/api/auth/login',{username:'dona-a',password:'senha-da-floricultura'})).status,403);
  assert.equal((await api('/api/admin/orders',undefined,other)).status,200);assert.equal((await api('/api/auth/management/me',undefined,master)).status,200);
  const products=(await api('/api/products?store='+a.slug)).data,date=new Date(Date.now()+86400000).toISOString().slice(0,10),order={customer:'Cliente Teste',phone:'11987654321',recipient:'Destinatário Teste',fulfillment:'pickup',date,period:'Manhã',paymentMethod:'pix',items:[{id:products[0].id,quantity:1}]};
  assert.equal((await api('/api/orders?store='+a.slug,order)).status,403);assert.equal((await api('/api/store-settings?store='+a.slug)).data.orderingBlocked,true);assert.doesNotMatch(JSON.stringify((await api('/api/store-settings?store='+a.slug)).data),/billing|Mensalidade|15000|confirmedBy/);
  assert.equal((await api(path,{action:'configure',enabled:true,blockPanel:false,blockSite:true},master)).status,200);assert.equal((await api('/api/admin/orders',undefined,owner)).status,200);assert.equal((await api('/api/orders?store='+a.slug,order)).status,403);assert.doesNotMatch(JSON.stringify((await api('/api/auth/me',undefined,owner)).data),/billing|Mensalidade/);
  assert.equal((await api(path,{action:'configure',enabled:true,blockPanel:true,blockSite:false},master)).status,200);assert.equal((await api('/api/admin/orders',undefined,owner)).status,403);assert.equal((await api('/api/orders?store='+a.slug,order)).status,201);
  assert.equal((await api('/api/platform/tenants/'+b.id+'/finance',{action:'pay',id,paidDate:day(),method:'pix'},master)).status,404);
  const second=await api(path,{action:'charge',description:'Outra cobrança vencida',amount:5000,dueDate:yesterday},master),secondId=second.data.billing.charges[1].id;
  assert.equal((await api(path,{action:'pay',id,paidDate:day(),method:'pix'},master)).data.access.blocked,true);
  const racing=await Promise.all([api(path,{action:'pay',id:secondId,paidDate:day(),method:'pix'},master),api(path,{action:'pay',id:secondId,paidDate:day(),method:'pix'},master)]);assert.deepEqual(racing.map(r=>r.status).sort(),[200,409]);
  assert.equal((await api('/api/admin/orders',undefined,owner)).status,200);await login('dona-a','senha-da-floricultura');
  const manualSuspend=await api('/api/platform/tenants/'+a.id,{active:false},master,'PATCH');assert.equal(manualSuspend.status,200);
  assert.equal((await api('/api/auth/login',{username:'dona-a',password:'senha-da-floricultura'})).status,401);
  const finances=(await api('/api/platform/finance',undefined,master)).data;assert.equal(finances.find(t=>t.id===a.id).billing.charges.length,2);assert.equal(finances.find(t=>t.id===b.id).billing.charges.length,0);
 }finally{await new Promise(r=>server.close(r));}
});
