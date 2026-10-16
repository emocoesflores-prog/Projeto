const {test}=require('node:test');
const assert=require('node:assert/strict');
process.env.DATA_MODE='demo';process.env.ADMIN_TOKEN='pdv-test-key';
const app=require('../server');
const options=require('../public/order-options');
const dashboard=require('../public/dashboard-model');
async function session(run){const server=app.listen(0);const base=`http://127.0.0.1:${server.address().port}`;async function request(path,data,method='POST'){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer pdv-test-key'},body:JSON.stringify(data)});return {status:r.status,body:await r.json()}}try{await run(request)}finally{await new Promise(resolve=>server.close(resolve))}}
const sale={fulfillment:'store',scheduleMode:'now',paymentMethod:'pix',items:[{id:1,quantity:1}]};
const customer={customer:'Cliente PDV',phone:'11999999999',recipient:'Destinatária PDV'};
test('Venda na loja para agora: consumidor final, sem frete e data calculada pelo servidor',()=>session(async request=>{
 const r=await request('/api/admin/orders',{...sale,date:'2099-12-31',timeSlot:'17:00 - 18:40',shippingFee:2000});
 assert.equal(r.status,201);assert.equal(r.body.fulfillment,'store');assert.equal(r.body.customer,'Consumidor final');assert.equal(r.body.phone,'');assert.equal(r.body.customerIdentified,false);assert.equal(r.body.date,options.localDate());assert.equal(r.body.scheduleMode,'now');assert.equal(r.body.timeSlot,'');assert.equal(r.body.shippingFee,0);assert.equal(r.body.total,14900);assert.equal(r.body.paymentStatus,'pending');
 assert.equal(dashboard.customers([r.body]).length,0);
}));
test('PDV: retirada e entrega exigem contato, mas apenas entrega cobra frete',()=>session(async request=>{
 for(const mode of ['pickup','delivery'])assert.equal((await request('/api/admin/orders',{...sale,fulfillment:mode})).status,400);
 const pickup=await request('/api/admin/orders',{...sale,...customer,fulfillment:'pickup'});assert.equal(pickup.status,201);assert.equal(pickup.body.shippingFee,0);
 assert.equal((await request('/api/admin/orders',{...sale,...customer,fulfillment:'delivery'})).status,400);
 const delivery=await request('/api/admin/orders',{...sale,...customer,fulfillment:'delivery',city:'Mauá',address:'Rua Havana, 95, Parque das Américas'});assert.equal(delivery.status,201);assert.equal(delivery.body.shippingFee,2000);assert.equal(delivery.body.total,16900);
}));
test('Agendamento do PDV exige data e faixa válida e conserva o período escolhido',()=>session(async request=>{
 const scheduled={...sale,scheduleMode:'scheduled',date:'2099-01-01',timeSlot:'13:40 - 15:20',period:'Tarde'};
 const r=await request('/api/admin/orders',scheduled);assert.equal(r.status,201);assert.equal(r.body.timeSlot,'13:40 - 15:20');assert.equal(r.body.date,'2099-01-01');assert.equal(r.body.period,'Tarde');assert.equal(r.body.scheduleMode,'scheduled');
 for(const invalid of [{...scheduled,timeSlot:''},{...scheduled,timeSlot:'11:00 - 12:00'},{...scheduled,period:'Manhã'},{...scheduled,date:'2020-01-01'},{...scheduled,date:'2099-02-31'}])assert.equal((await request('/api/admin/orders',invalid)).status,400);
}));
test('O site público não pode forjar venda no balcão ou pedido para agora',()=>session(async request=>{
 assert.equal((await request('/api/orders',sale)).status,400);
 assert.equal((await request('/api/orders',{...sale,...customer,fulfillment:'pickup'})).status,400);
}));
test('Venda na loja tem conclusão própria e não pode sair para entrega',()=>session(async request=>{
 let o=(await request('/api/admin/orders',sale)).body;
 async function patch(data){const r=await request('/api/admin/orders/'+o.id,{...data,version:o.version},'PATCH');if(r.status===200)o=r.body;return r}
 assert.equal((await patch({action:'payment',confirmed:true,reference:'Conferência no balcão'})).status,200);assert.equal(o.status,'Recebido');
 await patch({action:'status',status:'Em preparação'});
 await patch({action:'production',checklist:{arrangement:true,card:false,packaging:true},florist:'Florista teste',driver:'',internalNote:''});
 await patch({action:'status',status:'Pronto'});
 assert.equal((await patch({action:'status',status:'Saiu para entrega'})).status,400);
 assert.equal((await patch({action:'status',status:'Concluído na loja'})).status,200);assert.equal(o.status,'Concluído na loja');
 assert.equal((await patch({action:'status',status:'Cancelado',reason:'Pedido concluído'})).status,409);
}));
test('Horários usam São Paulo e bloqueiam faixas já encerradas sem fechar domingos por suposição',()=>{
 const now=new Date('2026-10-16T16:00:00Z'); // 13h em São Paulo
 assert.equal(options.localTime(now),'13:00');assert.equal(options.expired('2026-10-16','10:50 - 12:30',now),true);assert.equal(options.expired('2026-10-16','13:40 - 15:20',now),false);assert.equal(options.expired('2026-10-18','09:10 - 10:50',now),false);assert.equal(options.modality('store'),'Venda na Loja');assert.equal(options.period('09:10 - 10:50'),'Manhã');
});
