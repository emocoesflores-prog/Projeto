process.env.AUTH_MODE='legacy';
const {test}=require('node:test');
const assert=require('node:assert/strict');
process.env.DATA_MODE='demo';process.env.ADMIN_TOKEN='operations-test-key';
const app=require('../server');
const {applyMutation,normalizeOrder}=require('../order-domain');
const data={customer:'Cliente Teste',phone:'11999999999',recipient:'Destinatária Teste',fulfillment:'delivery',city:'Mauá',address:'Rua de Teste, 100, Centro',date:'2099-01-01',period:'Tarde',paymentMethod:'pix',message:'Feliz aniversário!',anonymous:true,occasion:'Aniversário',flowerNotes:'Rosas claras',items:[{id:1,quantity:2,note:'Embalagem rosa'}]};
let fixtureNumber=0;
async function session(run){const server=app.listen(0);const base=`http://127.0.0.1:${server.address().port}`;const headers={Authorization:'Bearer operations-test-key','Content-Type':'application/json'};async function request(path,body,method='POST',authorized=true){const r=await fetch(base+path,{method,headers:authorized?headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}}
 async function create(body=data){
 const customer=await request('/api/admin/customers',{name:body.customer,phone:'1190000'+String(++fixtureNumber).padStart(4,'0')});assert.equal(customer.status,201);
 const address=await request('/api/admin/customers/'+customer.body.id+'/addresses',{zipCode:'09370-670',street:'Rua de Teste',number:'100',neighborhood:'Centro',city:'Mauá',state:'SP',recipient:body.recipient,recipientPhone:'11999999999'});assert.equal(address.status,201);
 return request('/api/admin/orders',{...body,customerId:customer.body.id,deliveryAddressId:address.body.id,deliveryAddressVersion:address.body.version});
 }
 try{await run(request,create)}finally{await new Promise(r=>server.close(r))}}
test('Pedido manual exige autorização, fixa preços e não aceita pagamento forjado',()=>session(async(request,create)=>{
 assert.equal((await request('/api/admin/orders',data,'POST',false)).status,401);
 const r=await create({...data,paymentStatus:'paid',status:'Entregue',items:[{...data.items[0],unitPrice:1,name:'Preço forjado'}]});assert.equal(r.status,201);assert.equal(r.body.paymentStatus,'pending');assert.equal(r.body.status,'Aguardando pagamento');assert.equal(r.body.items[0].unitPrice,14900);assert.equal(r.body.items[0].name,'Buquê Aurora');assert.equal(r.body.items[0].note,'Embalagem rosa');assert.equal(r.body.history.length,1);
}));
test('Entrega: recebimento, conferência floral, responsável e histórico',()=>session(async(request,create)=>{
 let o=(await create(data)).body;
 const patch=body=>request('/api/admin/orders/'+o.id,{...body,version:o.version},'PATCH');
 assert.equal((await patch({action:'status',status:'Em preparação'})).status,400);
 assert.equal((await patch({action:'payment',confirmed:false,reference:'comprovante'})).status,400);
 assert.equal((await request('/api/admin/orders/'+o.id,{action:'payment',version:o.version,confirmed:true,reference:'Pix verificado 123'},'PATCH',false)).status,401);
 let r=await patch({action:'payment',confirmed:true,reference:'Pix verificado 123'});assert.equal(r.status,200);o=r.body;assert.equal(o.status,'Agendado');assert.equal(o.payment.amount,o.total);assert.equal(o.payment.source,'manual');
 assert.equal((await patch({action:'payment',confirmed:true,reference:'duplicado'})).status,409);
 assert.equal((await request('/api/admin/orders/'+o.id,{action:'status',version:0,status:'Em preparação'},'PATCH')).status,409);
 o=(await patch({action:'status',status:'Aguardando preparação'})).body;
 o=(await patch({action:'status',status:'Em preparação'})).body;
 assert.equal((await patch({action:'status',status:'Pronto aguardando entregador'})).status,409);
 o=(await patch({action:'production',checklist:{arrangement:true,packaging:true,card:false},florist:'Maria',driver:'',internalNote:'Cuidado com as pétalas'})).body;
 assert.equal((await patch({action:'status',status:'Pronto aguardando entregador'})).status,409,'Mensagem precisa ser conferida');
 o=(await patch({action:'production',checklist:{arrangement:true,packaging:true,card:true},florist:'Maria',driver:'',internalNote:'Cuidado com as pétalas'})).body;
 o=(await patch({action:'status',status:'Pronto aguardando entregador'})).body;
 assert.equal((await patch({action:'status',status:'Esperando retirada'})).status,400);
 assert.equal((await patch({action:'status',status:'Saiu para entrega'})).status,409);
 o=(await patch({action:'production',checklist:o.checklist,florist:'Maria',driver:'João',internalNote:'Cuidado'})).body;
 o=(await patch({action:'status',status:'Saiu para entrega'})).body;
 const edits={...data,recipient:'Outra Pessoa'};delete edits.items;delete edits.paymentMethod;
 assert.equal((await patch({action:'details',details:edits})).status,409);
 o=(await patch({action:'status',status:'Entregue'})).body;
 assert.equal(o.status,'Entregue');assert.ok(o.history.length>=9);assert.equal(o.items[0].unitPrice,14900);
 assert.equal((await patch({action:'status',status:'Cancelado',reason:'Não deve alterar concluído'})).status,409);
}));
test('Retirada segue fluxo próprio; edição preserva preço e modalidade',()=>session(async(request,create)=>{
 let o=(await request('/api/admin/orders',{...data,fulfillment:'pickup',city:undefined,address:undefined,message:''})).body;
 const patch=body=>request('/api/admin/orders/'+o.id,{...body,version:o.version},'PATCH');
 const details={...data,fulfillment:'pickup',city:undefined,address:undefined,message:'Cartão atualizado',recipient:'Destinatária Atualizada'};delete details.items;delete details.paymentMethod;
 let r=await patch({action:'details',details});assert.equal(r.status,200);o=r.body;assert.equal(o.total,29800);assert.equal(o.shippingFee,0);
 assert.equal((await patch({action:'details',details:{...details,fulfillment:'delivery',city:'Mauá',address:'Rua Teste, 100, Centro'}})).status,409);
 o=(await patch({action:'payment',confirmed:true,reference:'Cartão operadora ABC'})).body;
 o=(await patch({action:'status',status:'Aguardando preparação'})).body;
 o=(await patch({action:'status',status:'Em preparação'})).body;
 o=(await patch({action:'production',checklist:{arrangement:true,card:true,packaging:true},florist:'Maria',driver:'',internalNote:''})).body;
 o=(await patch({action:'status',status:'Pronto aguardando retirada'})).body;
 assert.equal((await patch({action:'status',status:'Saiu para entrega'})).status,400);
  o=(await patch({action:'status',status:'Concluído'})).body;assert.equal(o.status,'Concluído');
}));
test('Cancelamento exige motivo e sinaliza estorno sem executar devolução',()=>session(async(request,create)=>{
 let o=(await create(data)).body;
 const patch=body=>request('/api/admin/orders/'+o.id,{...body,version:o.version},'PATCH');
 assert.equal((await patch({action:'status',status:'Cancelado'})).status,400);
 o=(await patch({action:'payment',confirmed:true,reference:'Pix recebido xyz'})).body;
 o=(await patch({action:'status',status:'Cancelado',reason:'Cliente desistiu'})).body;
 assert.equal(o.refundRequired,true);assert.equal(o.paymentStatus,'paid');assert.match(o.history.at(-1).description,/estorno fora/);
}));
test('Pedidos antigos podem ser operados sem migração e concorrência não perde histórico',()=>{
 const original=normalizeOrder({...data,id:'antigo',status:'Aguardando pagamento',total:31800});assert.equal(original.version,0);assert.deepEqual(original.history,[]);
 const next=applyMutation(original,{action:'payment',version:0,confirmed:true,reference:'Recebido no banco'});assert.equal(next.history.length,1);assert.equal(original.history.length,0);
 assert.throws(()=>applyMutation(next,{action:'status',version:0,status:'Em preparação'}),/outra tela/);
});
test('Alterar cartão de pedido pronto exige reconferência e preserva o histórico anterior',()=>{
 const original=normalizeOrder({...data,version:3,status:'Pronto',paymentStatus:'paid',total:31800,checklist:{arrangement:true,card:true,packaging:true}});
 const details={...data,recipient:'Novo destinatário'};delete details.items;delete details.paymentMethod;
 const updated=applyMutation(original,{action:'details',version:3,details});
 assert.equal(updated.status,'Aguardando preparação');assert.equal(updated.checklist.card,false);assert.equal(original.checklist.card,true);
 assert.ok(updated.history.at(-1).changes.some(c=>c.field==='recipient'&&c.before==='Destinatária Teste'&&c.after==='Novo destinatário'));
 assert.throws(()=>applyMutation(original,{action:'production',version:3,checklist:{arrangement:false,card:true,packaging:true},florist:'Maria',driver:'João',internalNote:''}),/Não remova conferências/);
});
