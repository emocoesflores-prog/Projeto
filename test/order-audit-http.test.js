process.env.DATA_MODE='demo';process.env.AUTH_MODE='multi';process.env.ADMIN_TOKEN='audit-fixture-token';
const {test}=require('node:test'),assert=require('node:assert/strict'),app=require('../server');
test('edição por linha autentica, respeita concorrência, mantém histórico após paginação e nega acesso de outra loja',async()=>{
 const server=app.listen(0),base='http://127.0.0.1:'+server.address().port;
 async function api(path,body,s,method=body?'POST':'GET'){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(s?{Cookie:s.cookie,'X-CSRF-Token':s.csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const ok=async(...args)=>{const r=await api(...args);assert.ok(r.status<300,JSON.stringify(r.data));return r;};
 try{
  await ok('/api/auth/bootstrap',{setupKey:process.env.ADMIN_TOKEN,name:'Gestor',username:'gestor',password:'senha-gestor-auditoria'});const m=await ok('/api/auth/management/login',{username:'gestor',password:'senha-gestor-auditoria'}),master={cookie:m.cookie,csrf:m.data.csrf};
  async function shop(slug){await ok('/api/platform/tenants',{name:'Loja '+slug,slug,ownerName:'Responsável '+slug,username:slug,password:'senha-loja-auditoria',profile:{}},master);const r=await ok('/api/auth/login',{username:slug,password:'senha-loja-auditoria'});return {cookie:r.cookie,csrf:r.data.csrf};}
  const a=await shop('auditoria-a'),b=await shop('auditoria-b');let o=(await ok('/api/admin/orders',{customer:'Cliente Inicial',phone:'11988887777',recipient:'Pessoa Inicial',fulfillment:'pickup',scheduleMode:'now',paymentMethod:'pix',items:[{id:1,quantity:1}]},a)).data;
  const path='/api/admin/orders/'+o.id,change={action:'field',version:o.version,field:'recipient',value:'Pessoa corrigida'};
  assert.equal((await api(path,change,undefined,'PATCH')).status,401);assert.equal((await api(path,change,{cookie:a.cookie},'PATCH')).status,403);assert.equal((await api(path,change,b,'PATCH')).status,404);
  o=(await ok(path,change,a,'PATCH')).data;assert.equal(o.recipient,'Pessoa corrigida');assert.equal((await api(path,change,a,'PATCH')).status,409);
  assert.equal((await api(path,{action:'field',version:o.version,field:'total',value:1},a,'PATCH')).status,400);
  for(let i=0;i<54;i++)o=(await ok(path,{action:'field',version:o.version,field:'deliveryNotes',value:'Orientação '+i},a,'PATCH')).data;
  const current=(await ok(path,undefined,a)).data;assert.equal(current.history.length,20);assert.equal(current.historyCount,56);
  const p1=(await ok(path+'/events',undefined,a)).data,p2=(await ok(path+'/events?before='+p1.nextBefore,undefined,a)).data;assert.equal(p1.events.length,50);assert.equal(p2.events.length,6);const edited=p2.events.find(e=>e.changes?.some(c=>c.field==='recipient'));
  assert.equal(edited.actor,'Responsável auditoria-a');assert.ok(edited.actorId);assert.equal(edited.actorRole,'owner');assert.deepEqual(edited.changes.find(c=>c.field==='recipient'),{field:'recipient',before:'Pessoa Inicial',after:'Pessoa corrigida'});assert.ok(Date.parse(edited.at));assert.equal(p2.events.at(-1).actor,'Responsável auditoria-a');
  assert.equal((await api(path+'/events',undefined,b)).status,404);assert.equal((await api(path+'/events?before=-1',undefined,a)).status,400);assert.equal((await api(path+'/events?before=1e12',undefined,a)).status,400);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
