const {test}=require('node:test');const assert=require('node:assert/strict');
process.env.DATA_MODE='demo';process.env.ADMIN_TOKEN='addresses-test-key';
const app=require('../server');const {createCepService}=require('../cep-service');const masks=require('../public/input-masks');
const data={label:'Casa da mãe',zipCode:'09370-670',street:'Rua de Teste',number:'95',neighborhood:'Centro',city:'Mauá',state:'SP',recipient:'Pessoa Presenteada',recipientPhone:'(11) 98888-7777',reference:'Portão verde'};
let count=0;
async function session(run){const server=app.listen(0),base=`http://127.0.0.1:${server.address().port}`;async function request(path,body,method='POST',auth=true){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer addresses-test-key'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()}}try{const buyer=(await request('/api/admin/customers',{name:'Comprador Teste',phone:'1191000'+String(++count).padStart(4,'0')})).body;await run(request,buyer)}finally{await new Promise(resolve=>server.close(resolve))}}
test('Cliente pode ter vários endereços e cada edição preserva todas as versões',()=>session(async(request,buyer)=>{
 const path='/api/admin/customers/'+buyer.id+'/addresses';
 let first=await request(path,data);assert.equal(first.status,201);assert.equal(first.body.history.length,1);assert.equal(first.body.recipientPhone,'5511988887777');
 const second=await request(path,{...data,label:'Trabalho',number:'200',recipient:'Outra Pessoa'});assert.equal(second.status,201);
 let list=(await request(path,undefined,'GET')).body;assert.equal(list.length,2);
 const original=first.body;
 first=await request(path+'/'+original.id,{...data,number:'123A',recipient:'Nome Atualizado',version:0,history:[],createdAt:'2000-01-01'},'PATCH');assert.equal(first.status,200);assert.equal(first.body.version,1);assert.equal(first.body.createdAt,original.createdAt);assert.equal(first.body.history.length,2);assert.equal(first.body.history[0].after.number,'95');assert.equal(first.body.history[1].before.number,'95');assert.equal(first.body.history[1].after.number,'123A');
 assert.equal((await request(path+'/'+original.id,{...data,number:'999',version:0},'PATCH')).status,409);
 list=(await request(path,undefined,'GET')).body;assert.equal(list.length,2);assert.equal(list.find(a=>a.id===second.body.id).number,'200');assert.equal(list.find(a=>a.id===original.id).number,'123A');
}));
test('Número, destinatário, telefone, CEP e área atendida são validados também no servidor',()=>session(async(request,buyer)=>{
 const path='/api/admin/customers/'+buyer.id+'/addresses';
 for(const invalid of [{number:''},{number:'s/n'},{recipient:''},{recipientPhone:''},{recipientPhone:'111'},{zipCode:'000'},{street:''},{neighborhood:''},{city:'São Paulo'},{state:'RJ'}])assert.equal((await request(path,{...data,...invalid})).status,400);
 assert.equal((await request(path,data,'POST',false)).status,401);
 assert.equal((await request(path,undefined,'GET',false)).status,401);
}));
test('Pedido usa versão salva do endereço e mantém a cópia histórica após edição',()=>session(async(request,buyer)=>{
 const path='/api/admin/customers/'+buyer.id+'/addresses';let address=(await request(path,data)).body;
 const body={fulfillment:'delivery',scheduleMode:'now',customerId:buyer.id,deliveryAddressId:address.id,deliveryAddressVersion:0,paymentMethod:'pix',items:[{id:1,quantity:1}],recipient:'Nome forjado',address:'Rua forjada'};
 const response=await request('/api/admin/orders',body);assert.equal(response.status,201);const order=response.body;assert.equal(order.recipient,data.recipient);assert.match(order.address,/95/);assert.equal(order.deliveryAddress.number,'95');assert.equal(order.deliveryAddress.version,0);assert.equal(order.recipientPhone,'5511988887777');
 address=(await request(path+'/'+address.id,{...data,number:'777',version:0},'PATCH')).body;
 assert.equal((await request('/api/admin/orders',body)).status,409);
 const later=await request('/api/admin/orders',{...body,deliveryAddressVersion:1});assert.equal(later.status,201);assert.equal(later.body.deliveryAddress.number,'777');
 const orders=(await request('/api/admin/orders',undefined,'GET')).body;assert.equal(orders.find(o=>o.id===order.id).deliveryAddress.number,'95');assert.match(orders.find(o=>o.id===order.id).address,/95/);
}));
test('Endereço de outro cliente não pode ser usado ou editado',()=>session(async(request,buyer)=>{
 const address=(await request('/api/admin/customers/'+buyer.id+'/addresses',data)).body;
 const other=(await request('/api/admin/customers',{name:'Outro Comprador',phone:'11999990001'})).body;
 const order=await request('/api/admin/orders',{fulfillment:'delivery',scheduleMode:'now',customerId:other.id,deliveryAddressId:address.id,deliveryAddressVersion:0,paymentMethod:'pix',items:[{id:1,quantity:1}]});assert.equal(order.status,404);
 assert.equal((await request('/api/admin/customers/'+other.id+'/addresses/'+address.id,{...data,version:0},'PATCH')).status,404);
}));
test('CEP consulta somente ViaCEP, reutiliza cache e não inventa endereço em falha',async()=>{
 let calls=0;const lookup=createCepService(async url=>{calls++;assert.equal(url,'https://viacep.com.br/ws/09370670/json/');return {ok:true,json:async()=>({logradouro:'Avenida Dom José Gaspar',bairro:'Matriz',localidade:'Mauá',uf:'SP'})}});
 const first=await lookup('09370670');assert.equal(first.street,'Avenida Dom José Gaspar');first.street='Alteração local';assert.equal((await lookup('09370670')).street,'Avenida Dom José Gaspar');assert.equal(calls,1);
 await assert.rejects(lookup('../../host'),error=>error.status===400);assert.equal(calls,1);
 await assert.rejects(createCepService(async()=>({ok:true,json:async()=>({erro:true})}))('09370670'),error=>error.status===404);
 await assert.rejects(createCepService(async()=>{throw Error('falha de rede')})('09370670'),error=>error.status===503&&/manualmente/.test(error.message));
});
test('Máscaras exibem celular, telefone fixo e CEP sem duplicar +55',()=>{
 assert.equal(masks.phone('11987654321'),'(11) 98765-4321');assert.equal(masks.phone('+55 (11) 98765-4321'),'(11) 98765-4321');assert.equal(masks.phone('1123456789'),'(11) 2345-6789');assert.equal(masks.phone(''), '');assert.equal(masks.cep('09370670'),'09370-670');
});
