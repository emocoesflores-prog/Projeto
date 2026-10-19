const {test}=require('node:test'),assert=require('node:assert/strict');
const {createLocalityService,searchCities}=require('../locality-service');
test('Cidades locais e bairros por município: busca sem acento, cache e falha recuperável',async()=>{
 const maua=searchCities('maua','SP').find(c=>c.name==='Mauá');assert.ok(maua);assert.equal(maua.id,'3529401');assert.ok(searchCities('sao paulo').some(c=>c.name==='São Paulo'&&c.state==='SP'));
 let calls=0;const service=createLocalityService({seed:{},fetcher:async url=>{calls++;if(url.hostname==='viacep.com.br')throw Error('test postal offline');assert.match(url.searchParams.get('data'),/3529401/);return {ok:true,json:async()=>({elements:[{tags:{name:'Centro'}},{tags:{name:' centro '}},{tags:{name:'Parque das Américas'}}]})};}});
 const result=await service.neighborhoods(maua.id);assert.equal(result.unavailable,false);assert.equal(result.neighborhoods.length,2);await service.neighborhoods(maua.id);assert.equal(calls,3);
 const failing=createLocalityService({seed:{},fetcher:async()=>{throw Error('offline')}});assert.equal((await failing.neighborhoods(maua.id)).unavailable,true);await assert.rejects(()=>failing.neighborhoods('invalid'),/cidade válida/);
});
test('Mauá tem bairros verificados sem rede, e fonte postal ignora bairros de município diferente',async()=>{let calls=0;const local=createLocalityService({fetcher:async()=>{calls++;throw Error('offline')}});const saved=await local.neighborhoods('3529401');assert.equal(calls,0);assert.equal(saved.unavailable,false);assert.equal(saved.complete,false);assert.ok(saved.neighborhoods.length>=62);assert.ok(saved.neighborhoods.includes('Parque das Américas'));assert.ok(saved.neighborhoods.includes('Jardim Zaira'));const postal=createLocalityService({seed:{},fetcher:async()=>({ok:true,json:async()=>[{bairro:'Centro',ibge:'3547809',uf:'SP',localidade:'Santo André'},{bairro:'Bairro de outra cidade',ibge:'3529401',uf:'SP',localidade:'Mauá'}]})});const result=await postal.neighborhoods('3547809');assert.deepEqual(result.neighborhoods,['Centro']);assert.equal(result.source,'ViaCEP');});
process.env.AUTH_MODE='multi';process.env.DATA_MODE='demo';process.env.ADMIN_TOKEN='locations-pickup-performance-test-key';
const app=require('../server');
test('Vários locais de retirada, histórico imutável e análises isoladas por floricultura',async()=>{
 const server=app.listen(0);await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 async function api(path,body,session,method=body===undefined?'GET':'POST'){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 async function login(username,password,management=false){const r=await api('/api/auth/'+(management?'management/':'')+'login',{username,password});assert.equal(r.status,200);return {...r.data,cookie:r.cookie};}
 try{
  await api('/api/auth/bootstrap',{setupKey:process.env.ADMIN_TOKEN,name:'Gestor Teste',username:'gestor',password:'senha-do-gestor-teste'});const master=await login('gestor','senha-do-gestor-teste',true);
  const make=async(slug,user)=>(await api('/api/platform/tenants',{name:'Floricultura '+slug,slug,ownerName:'Dono Teste',username:user,password:'senha-do-dono-teste',profile:{assistantName:'Rosa'}},master)).data;
  const a=await make('loja-retirada-a','dona-a'),b=await make('loja-retirada-b','dona-b'),owner=await login('dona-a','senha-do-dono-teste'),other=await login('dona-b','senha-do-dono-teste');
  assert.equal((await api('/api/admin/locations/cities?q=maua')).status,401);const cities=await api('/api/admin/locations/cities?q=maua',undefined,owner);assert.ok(cities.data.some(c=>c.id==='3529401'));
  const first={id:require('node:crypto').randomUUID(),name:'Unidade Centro',zipCode:'09350000',street:'Rua das Flores',number:'20',neighborhood:'Centro',city:'Mauá',state:'SP'},second={...first,id:require('node:crypto').randomUUID(),name:'Unidade Jardim',number:'50'};
  assert.equal((await api('/api/admin/delivery-settings',{pickupLocations:[first,second],deliveryRates:[{city:'Mauá',cityId:'3529401',state:'SP',neighborhood:'Centro',fee:700}]},owner,'PUT')).status,200);
  assert.equal((await api('/api/admin/delivery-settings',{pickupLocations:[{...first,number:''}],deliveryRates:[]},owner,'PUT')).status,400);
  const config=(await api('/api/store-settings?store='+a.slug)).data;assert.equal(config.pickupLocations.length,2);assert.match(config.pickupAddress,/20/);assert.equal((await api('/api/store-settings?store='+b.slug)).data.pickupLocations,undefined);
  const catalog=(await api('/api/products?store='+a.slug)).data,date=new Date(Date.now()+86400000).toISOString().slice(0,10),body={customer:'Cliente Teste',phone:'11987654321',recipient:'Quem Recebe',fulfillment:'pickup',date,period:'Manhã',paymentMethod:'pix',items:[{id:catalog[0].id,quantity:2}]};
  assert.equal((await api('/api/orders?store='+a.slug,body)).status,400);assert.equal((await api('/api/orders?store='+a.slug,{...body,pickupLocationId:'legacy'})).status,400);
  const created=await api('/api/orders?store='+a.slug,{...body,pickupLocationId:second.id});assert.equal(created.status,201);
  let order=(await api('/api/admin/orders',undefined,owner)).data.find(o=>o.id===created.data.id);assert.equal(order.pickupLocation.name,second.name);assert.match(order.pickupLocation.formattedAddress,/50/);
  await api('/api/admin/delivery-settings',{pickupLocations:[{...first,number:'99'}],deliveryRates:[]},owner,'PUT');order=(await api('/api/admin/orders',undefined,owner)).data.find(o=>o.id===created.data.id);assert.match(order.pickupLocation.formattedAddress,/50/);
  const paid=await api('/api/admin/orders/'+order.id,{action:'payment',version:order.version,confirmed:true,reference:'Conferido no teste'},owner,'PATCH');assert.equal(paid.status,200,JSON.stringify(paid.data));
  const today=require('../public/order-options').localDate(),url='/api/admin/performance?from='+today+'&to='+today;
  const report=await api(url,undefined,owner);assert.equal(report.status,200);assert.equal(report.data.cards.orders,1);assert.equal(report.data.cards.paid,1);assert.equal(report.data.cards.revenue,created.data.total);assert.equal(report.data.products[0].quantity,2);assert.equal(report.data.pickupUnits[0].label,second.name);
  assert.equal((await api(url,undefined,other)).data.cards.orders,0);assert.equal((await api(url)).status,401);assert.equal((await api('/api/admin/performance?from=2020-01-01&to=2026-01-01',undefined,owner)).status,400);
  assert.equal(report.data.discountTracking,true);assert.equal(report.data.truncated,false);
 }finally{await new Promise(r=>server.close(r));}
});

test('Análises separam receita paga, pendências e cancelamentos sem inventar descontos',()=>{
 const {summarize}=require('../analytics');const common={createdAt:'2026-10-17T15:00:00Z',phone:'11999999999',customer:'Cliente',source:'site',fulfillment:'pickup',items:[{id:1,name:'Rosa',quantity:2,unitPrice:5000}]};
 const report=summarize([{...common,id:'a',status:'Recebido',paymentStatus:'paid',total:10000},{...common,id:'b',status:'Cancelado',paymentStatus:'paid',total:20000,history:[{description:'Pedido cancelado: Duplicado. Pagamento já registrado: verificar estorno fora do sistema.'}]},{...common,id:'c',status:'Aguardando pagamento',paymentStatus:'pending',total:30000}],[{id:1,name:'Rosa',price:5000,category:'Flores'}],{total:1,createdInPeriod:1,emailCount:0,cities:[],genders:[]},{from:'2026-10-17',to:'2026-10-17'});
 assert.equal(report.cards.revenue,10000);assert.equal(report.cards.ticket,10000);assert.equal(report.cards.pending,1);assert.equal(report.cards.cancelled,1);assert.equal(report.products[0].quantity,2);assert.equal(report.daily[0].value,10000);assert.equal(report.paidCancelled,1);assert.equal(report.cancellationReasons[0].label,'Duplicado');assert.equal(report.discountTracking,true);
});
