const {test}=require('node:test');
const assert=require('node:assert/strict');
process.env.DATA_MODE='demo';process.env.ADMIN_TOKEN='customers-test-key';
const app=require('../server');
const {normalizePhone}=require('../customer-store');
async function session(run){const server=app.listen(0);const base=`http://127.0.0.1:${server.address().port}`;async function request(path,body,method='POST',authenticated=true){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(authenticated?{Authorization:'Bearer customers-test-key'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()}}try{await run(request)}finally{await new Promise(resolve=>server.close(resolve))}}
test('Cadastro requer somente nome/WhatsApp, exige autenticação e normaliza telefone',()=>session(async request=>{
 assert.equal((await request('/api/admin/customers',{name:'Ana Flores',phone:'11987654321'},'POST',false)).status,401);
 assert.equal((await request('/api/admin/customers?q=Ana',undefined,'GET',false)).status,401);
 for(const body of [{name:'Ana Flores'},{phone:'11987654321'},{name:'  ',phone:'11987654321'},{name:'Ana Flores',phone:'111'}])assert.equal((await request('/api/admin/customers',body)).status,400);
 const customer=(await request('/api/admin/customers',{name:'Ana Flores',phone:'(11) 98765-4321'})).body;assert.equal(customer.name,'Ana Flores');assert.equal(customer.phone,'5511987654321');assert.equal(customer.email,'');assert.equal(customer.birthDate,'');assert.equal(customer.gender,'Não informado');
 assert.equal((await request('/api/admin/customers',{name:'Outra pessoa',phone:'+55 11 98765-4321'})).status,409);
 const fetched=await request('/api/admin/customers/'+customer.id,undefined,'GET');assert.equal(fetched.status,200);assert.equal(fetched.body.id,customer.id);
}));
test('Busca encontra nome sem acento, telefone formatado e clientes sem pedido',()=>session(async request=>{
 const created=(await request('/api/admin/customers',{name:'José Lírio',phone:'11977776666',email:'jose@example.com',birthDate:'1990-02-15',gender:'Outro',notes:'Gosta de rosas',preferences:'Flores amarelas',zipCode:'09350-000',street:'Rua Havana',number:'95',city:'Mauá',state:'sp'})).body;
 for(const query of ['Jose','LIRIO','(11) 97777-6666','97777']){const r=await request('/api/admin/customers?q='+encodeURIComponent(query),undefined,'GET');assert.equal(r.status,200);assert.ok(r.body.some(c=>c.id===created.id));assert.ok(r.body.every(c=>c.notes===undefined),'A lista não expõe notas internas');}
 assert.deepEqual((await request('/api/admin/customers?q=inexistente-zxc',undefined,'GET')).body,[]);
 const full=(await request('/api/admin/customers/'+created.id,undefined,'GET')).body;assert.equal(full.notes,'Gosta de rosas');assert.equal(full.email,'jose@example.com');assert.equal(full.state,'SP');
 for(const invalid of [{email:'não-é-email'},{birthDate:'2099-01-01'},{birthDate:'2001-02-31'},{zipCode:'123'},{gender:'Inválido'}])assert.equal((await request('/api/admin/customers',{name:'Cliente Inválido',phone:'11966665555',...invalid})).status,400);
}));
test('Pedido referencia cliente cadastrado e usa nome/telefone do banco',()=>session(async request=>{
 const client=(await request('/api/admin/customers',{name:'Cliente do Banco',phone:'11922223333'})).body;
 const response=await request('/api/admin/orders',{customerId:client.id,customer:'Nome forjado',phone:'11900000000',fulfillment:'store',scheduleMode:'now',paymentMethod:'pix',items:[{id:1,quantity:1}]});assert.equal(response.status,201);assert.equal(response.body.customerId,client.id);assert.equal(response.body.customer,'Cliente do Banco');assert.equal(response.body.phone,'5511922223333');
 assert.equal((await request('/api/admin/orders',{customerId:'00000000-0000-4000-8000-000000000000'})).status,404);
 assert.equal((await request('/api/admin/orders',{customerId:'Inválido'})).status,400);
}));
test('WhatsApp mantém prefixo brasileiro sem duplicar o código de país',()=>{
 assert.equal(normalizePhone('11987654321'),'5511987654321');assert.equal(normalizePhone('+55 (11) 98765-4321'),'5511987654321');assert.equal(normalizePhone('111'),null);
});
