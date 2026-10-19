process.env.DATA_MODE='demo';process.env.AUTH_MODE='multi';process.env.ADMIN_TOKEN='shop-modules-test-key';
const {test}=require('node:test'),assert=require('node:assert/strict');
const app=require('../server');
test('lojas isoladas: categorias, cupons, caixa, produção, rota e agendamentos pelas APIs reais',async()=>{
 const server=app.listen(0),base='http://127.0.0.1:'+server.address().port;
 async function api(path,body,session,method=body===undefined?'GET':'POST'){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await r.json();return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const ok=async(...args)=>{const r=await api(...args);assert.ok(r.status<300,JSON.stringify(r.data));return r;};
 try{
  await ok('/api/auth/bootstrap',{setupKey:process.env.ADMIN_TOKEN,name:'Gestor Teste',username:'gestor-modulos',password:'senha-gestor-modulos'});const login=await ok('/api/auth/management/login',{username:'gestor-modulos',password:'senha-gestor-modulos'}),master={cookie:login.cookie,csrf:login.data.csrf};
  async function create(slug){await ok('/api/platform/tenants',{name:'Floricultura '+slug,slug,ownerName:'Responsável '+slug,username:slug,password:'senha-da-loja-modulos',profile:{deliveryCities:['Mauá'],deliveryFee:2000}},master);const r=await ok('/api/auth/login',{username:slug,password:'senha-da-loja-modulos'});return {cookie:r.cookie,csrf:r.data.csrf};}
  const a=await create('loja-modulos-a'),b=await create('loja-modulos-b');
  const state=async s=>(await ok('/api/admin/operations',undefined,s)).data;
  const change=async(action,data,s=a)=>ok('/api/admin/operations',{action,version:(await state(s)).state.revision,data},s);
  assert.equal((await api('/api/admin/operations')).status,401);assert.equal((await api('/api/admin/operations',undefined,master)).status,401);
  await change('category.save',{name:'Categoria da loja A',parentId:null,active:true});const cat=(await state(a)).state.categories.find(c=>c.name==='Categoria da loja A');
  assert.equal((await state(b)).state.categories.some(c=>c.id===cat.id),false);
  assert.equal((await api('/api/admin/operations',{action:'category.save',version:0,data:{id:cat.id,name:'Ataque',parentId:null,active:true}},b)).status,404);
  await change('coupon.save',{code:'BEMVINDO',type:'percent',value:10,minimum:0,starts:'2020-01-01',ends:'2099-12-31',limit:1,active:true});
  const body={customer:'Cliente Teste',phone:'11999999999',recipient:'Pessoa Teste',fulfillment:'delivery',city:'Mauá',address:'Rua de Teste, 100, Centro, Mauá, SP',neighborhood:'Centro',date:'2099-01-01',period:'Manhã',timeSlot:'09:10 - 10:50',paymentMethod:'pix',items:[{id:1,quantity:1}],couponCode:'BEMVINDO'};
  const quote=(await ok('/api/checkout/quote?store=loja-modulos-a',{items:body.items,fulfillment:body.fulfillment,city:body.city,neighborhood:body.neighborhood,address:body.address,couponCode:body.couponCode})).data;assert.equal(quote.discount.amount,1490);assert.equal(quote.total,15410);
  assert.equal((await api('/api/orders?store=loja-modulos-b',body)).status,400);
  const results=await Promise.all([api('/api/orders?store=loja-modulos-a',body),api('/api/orders?store=loja-modulos-a',body)]);assert.deepEqual(results.map(r=>r.status).sort(),[201,400]);
  const created=results.find(r=>r.status===201).data;let o=(await ok('/api/admin/orders/'+created.id,undefined,a)).data;assert.equal(o.total,15410);assert.equal(o.discount.code,'BEMVINDO');assert.equal((await api('/api/admin/orders/'+o.id,undefined,b)).status,404);
  o=(await ok('/api/admin/orders/'+o.id,{action:'payment',version:o.version,confirmed:true,reference:'Pix conferido manualmente'},a,'PATCH')).data;
  async function production(advance){const result=await change('workshop.save',{orderId:o.id,orderVersion:o.version,checklist:{arrangement:true,card:true,packaging:true},florist:'Florista A',internalNote:'Teste',advance});o=result.data.orders[0];}
  await production(true);assert.equal(o.status,'Em preparação');await production(true);assert.equal(o.status,'Pronto');
  await change('driver.save',{name:'Entregador A',phone:'11988887777',vehicle:'Moto',plate:'ABC1D23',active:true,notes:''});const driver=(await state(a)).state.drivers[0];
  const p=(await ok('/api/admin/routes/plan',{origin:{lat:-23.65,lng:-46.46},start:'2099-01-01T08:00:00-03:00',stops:[{orderId:o.id,location:{lat:-23.66,lng:-46.47}}]},a)).data;
  assert.equal((await api('/api/admin/operations',{action:'route.create',version:(await state(b)).state.revision,data:{planId:p.planId,driverId:driver.id,name:'Rota roubada'}},b)).status,409);
  await change('route.create',{planId:p.planId,driverId:driver.id,name:'Rota de teste'});const route=(await state(a)).state.routes[0];await change('route.dispatch',{id:route.id});await change('route.deliver',{id:route.id,orderId:o.id});assert.equal((await ok('/api/admin/orders/'+o.id,undefined,a)).data.status,'Entregue');
  const today=require('../public/order-options').localDate();const cash=(await ok('/api/admin/cash?from='+today+'&to='+today,undefined,a)).data;assert.equal(cash.income,15410);assert.equal((await ok('/api/admin/cash?from='+today+'&to='+today,undefined,b)).data.income,0);
  const s=(await state(a)).state.schedule;await change('schedule.save',{...s,enabled:true,horizonDays:30});assert.equal((await api('/api/orders?store=loja-modulos-a',{...body,couponCode:''})).status,400);
  const history=(await ok('/api/admin/order-history?q=Cliente&offset=0',undefined,a)).data;assert.equal(history.orders.length,1);assert.equal(history.orders[0].id,o.id);assert.equal((await ok('/api/admin/order-history?q=Cliente&offset=0',undefined,b)).data.orders.length,0);assert.equal((await api('/api/admin/order-history?offset=-1',undefined,a)).status,400);
  const publicSettings=(await ok('/api/store-settings?store=loja-modulos-a')).data;assert.equal(publicSettings.schedule.enabled,true);assert.doesNotMatch(JSON.stringify(publicSettings),/BEMVINDO|Entregador A|fiscal|cashEntries/);
  await ok('/api/site-events?store=loja-modulos-a',{event:'view',device:'mobile'});const analytics=(await ok('/api/admin/performance?from='+today+'&to='+today,undefined,a)).data;assert.equal(analytics.site[0].view,1);assert.equal(analytics.discountTotal,1490);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
