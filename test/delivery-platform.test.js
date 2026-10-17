const {test}=require('node:test'),assert=require('node:assert/strict');
process.env.AUTH_MODE='multi';process.env.DATA_MODE='demo';process.env.ADMIN_TOKEN='delivery-platform-test-key-only';
const app=require('../server');
test('Gestão edita acesso, preserva operação e isola taxas por cidade e bairro',async()=>{
 const server=app.listen(0);await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 async function api(path,body,session,method=body===undefined?'GET':'POST'){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
 async function login(username,password,management=false){const result=await api('/api/auth/'+(management?'management/':'')+'login',{username,password});assert.equal(result.status,200,JSON.stringify(result.data));return {...result.data,cookie:result.cookie};}
 try{
  await api('/api/auth/bootstrap',{setupKey:process.env.ADMIN_TOKEN,name:'Gestor de Teste',username:'gestor',password:'senha-do-gestor-teste'});
  const master=await login('gestor','senha-do-gestor-teste',true),id='00000000-0000-4000-8000-000000000001';
  let result=await api('/api/platform/tenants/'+id,{owner:{name:'Dona da loja',username:'dona',password:'senha-inicial-da-dona'}},master,'PATCH');assert.equal(result.status,200);
  let owner=await login('dona','senha-inicial-da-dona');
  const rates={pickupAddress:'Rua das Flores, 20, Centro, Mauá - SP',deliveryRates:[{city:'Mauá',neighborhood:'',fee:1000},{city:'Mauá',neighborhood:'Centro',fee:700},{city:'Santo André',neighborhood:'Jardim',fee:1800}]};
  assert.equal((await api('/api/admin/delivery-settings',rates,master,'PUT')).status,401);
  assert.equal((await api('/api/admin/delivery-settings',rates,owner,'PUT')).status,200);
  assert.equal((await api('/api/admin/delivery-settings',{...rates,deliveryRates:[rates.deliveryRates[0],{city:'maua',neighborhood:'',fee:4}]},owner,'PUT')).status,400);
  const duplicate=await api('/api/platform/tenants',{name:'Outra Floricultura',slug:'outra-floricultura',ownerName:'Outro Dono',username:'outro',password:'senha-do-outro-dono',profile:{assistantName:'Rosa',city:'São Paulo'}},master);assert.equal(duplicate.status,201);
  const other=await login('outro','senha-do-outro-dono');
  assert.equal((await api('/api/platform/tenants/'+id,{name:'Nome não pode vazar',owner:{name:'Dona Alterada',username:'outro'}},master,'PATCH')).status,409);
  assert.equal((await api('/api/store-settings?store=emocoes-flores')).data.name,'Floricultura Emoções Flores');
  assert.equal((await api('/api/platform/tenants/'+id,{profile:{zipCode:'09350000',address:'Rua Teste',number:'12',neighborhood:'Centro'},owner:{name:'Responsável atualizado',username:'nova-dona'}},master,'PATCH')).status,200);
  assert.equal((await api('/api/auth/me',undefined,owner)).status,401);
  assert.equal((await api('/api/auth/me',undefined,other)).status,200);
  owner=await login('nova-dona','senha-inicial-da-dona');
  const saved=(await api('/api/store-settings?store=emocoes-flores')).data;assert.deepEqual(saved.deliveryRates,rates.deliveryRates);assert.equal(saved.pickupAddress,rates.pickupAddress);
  const list=(await api('/api/platform/tenants',undefined,master)).data,shop=list.find(t=>t.id===id);assert.equal(shop.ownerName,'Responsável atualizado');assert.equal(shop.ownerUsername,'nova-dona');assert.doesNotMatch(JSON.stringify(list),/passwordHash|scrypt\$/);
  const products=(await api('/api/products?store=emocoes-flores')).data,date=new Date(Date.now()+86400000).toISOString().slice(0,10);
  const order={customer:'Cliente Teste',phone:'11987654321',recipient:'Pessoa Teste',fulfillment:'delivery',date,period:'Manhã',city:'Mauá',neighborhood:'Centro',address:'Rua Teste, 12, Centro',paymentMethod:'pix',items:[{id:products[0].id,quantity:1}]};
  result=await api('/api/orders?store=emocoes-flores',order);assert.equal(result.status,201,JSON.stringify(result.data));assert.equal(result.data.shippingFee,700);const orderId=result.data.id;
  const customer=await api('/api/admin/customers',{name:'Comprador Teste',phone:'11987654321'},owner);assert.equal(customer.status,201);
  const address=await api('/api/admin/customers/'+customer.data.id+'/addresses',{zipCode:'09350000',street:'Rua Teste',number:'20',neighborhood:'Centro',city:'Mauá',state:'SP',recipient:'Quem Recebe',recipientPhone:'11987654321'},owner);assert.equal(address.status,201);
  const manual=await api('/api/admin/orders',{...order,customerId:customer.data.id,deliveryAddressId:address.data.id,deliveryAddressVersion:address.data.version,neighborhood:'Bairro forjado',shippingFee:1},owner);assert.equal(manual.status,201,JSON.stringify(manual.data));assert.equal(manual.data.shippingFee,700);
  result=await api('/api/orders?store=emocoes-flores',{...order,neighborhood:'Outro'});assert.equal(result.data.shippingFee,1000);
  result=await api('/api/orders?store=emocoes-flores',{...order,city:'Santo André',neighborhood:'Não atendido'});assert.equal(result.status,400);
  assert.equal((await api('/api/orders?store=emocoes-flores',{...order,city:'Santo André',neighborhood:''})).status,400);
  assert.equal((await api('/api/store-settings?store=outra-floricultura')).data.pickupAddress,'');assert.deepEqual((await api('/api/store-settings?store=outra-floricultura')).data.deliveryRates,[]);assert.deepEqual((await api('/api/store-settings?store=outra-floricultura')).data.deliveryCities,[]);
  assert.equal((await api('/api/admin/delivery-settings',{...rates,deliveryRates:[]},owner,'PUT')).status,200);
  assert.equal((await api('/api/orders?store=emocoes-flores',order)).status,400);
  assert.equal((await api('/api/admin/orders',undefined,owner)).data.find(o=>o.id===orderId).shippingFee,700);
  assert.equal((await api('/api/platform/tenants/'+id,{owner:{name:'Dona Atual',username:'nova-dona',password:'nova-senha-da-dona'}},master,'PATCH')).status,200);
  assert.equal((await api('/api/auth/login',{username:'nova-dona',password:'senha-inicial-da-dona'})).status,401);await login('nova-dona','nova-senha-da-dona');
 }finally{await new Promise(r=>server.close(r));}
});
test('Máscaras e cotação consideram documentos, centavos e prioridade de bairro',()=>{
 const masks=require('../public/input-masks'),{quote}=require('../public/delivery-rates');assert.equal(masks.documentNumber('53770070000195'),'53.770.070/0001-95');assert.equal(masks.documentNumber('12345678901'),'123.456.789-01');assert.equal(masks.cep('09350000'),'09350-000');assert.equal(masks.moneyValue('1.000,00'),100000);assert.equal(masks.currency('12345'),'123,45');
 assert.equal(quote({deliveryRates:[{city:'Mauá',neighborhood:'Centro',fee:700},{city:'Mauá',neighborhood:'',fee:1000}]},'MAUA',' centro ').fee,700);
});
