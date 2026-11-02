const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {applyMutation}=require('../order-domain'),service=require('../order-fulfillment'),payments=require('../public/payment-model');
const actor={id:randomUUID(),name:'Operadora Modalidade',role:'staff'};
const base=()=>({id:randomUUID(),version:0,status:'Em preparação',workshopStartedAt:new Date().toISOString(),customer:'Cliente Teste',phone:'11988887777',recipient:'Pessoa Original',recipientPhone:'11977776666',fulfillment:'pickup',date:'2099-01-01',period:'Manhã',scheduleMode:'scheduled',timeSlot:'09:10 - 10:50',message:'Com carinho',total:14900,shippingFee:0,paymentStatus:'paid',paymentMethod:'pix',checklist:{arrangement:true,card:true,packaging:true},history:[]});
const address={id:randomUUID(),version:1,recipient:'Pessoa do endereço',recipientPhone:'5511966665555',zipCode:'09370670',street:'Rua das Flores',number:'123',neighborhood:'Matriz',city:'Mauá',state:'SP',reference:'Portão azul'};
const customer={id:randomUUID(),name:'Cliente Teste',phone:'5511988887777',addresses:[address]};
const settings={deliveryFee:2000,deliveryCities:['Mauá'],pickupAddress:'Rua da Loja, 100, Mauá'};
const input=(o,extra={})=>({action:'fulfillment',version:o.version,fulfillment:'delivery',scheduleMode:'scheduled',date:o.date,timeSlot:'13:40 - 15:20',customerId:customer.id,addressId:address.id,addressVersion:1,...extra});
async function change(o,data,extra={}){const resolved=await service.resolve(data,o,{customers:{get:async id=>id===customer.id?customer:null},settings,...extra}),plan=service.plan(o,data,resolved);return {next:applyMutation(o,{...data,expectedTotal:plan.quote.total},{actor,fulfillment:resolved}),quote:plan.quote,resolved};}
test('modalidade recalcula frete e saldo sem reescrever recebimentos, com auditoria e período automático',async()=>{
 const o=base(),{next,quote,resolved}=await change(o,input(o));
 assert.equal(next.fulfillment,'delivery');assert.equal(next.period,'Tarde');assert.equal(next.total,16900);assert.equal(next.shippingFee,2000);assert.equal(next.recipient,address.recipient);assert.equal(next.recipientPhone,address.recipientPhone);assert.equal(next.deliveryAddress.id,address.id);assert.equal(next.paymentStatus,'partial');assert.equal(next.status,'Aguardando pagamento');assert.equal(payments.paid(next),14900);assert.equal(quote.balance,2000);assert.equal(next.checklist.card,false);
 const event=next.history.at(-1);assert.equal(event.actor,actor.name);assert.equal(event.actorId,actor.id);assert.ok(Date.parse(event.at));for(const field of ['fulfillment','total','shippingFee','recipient','period'])assert.ok(event.changes.some(c=>c.field===field));
 assert.throws(()=>applyMutation(o,{...input(o),expectedTotal:1},{fulfillment:resolved}),/total mudou/);assert.throws(()=>applyMutation(o,input(o),{fulfillment:resolved}),/total/);
 assert.throws(()=>applyMutation(next,{...input(o),expectedTotal:16900},{fulfillment:resolved}),/Reabra|outra tela/);
});
test('retirada remove frete, preserva desconto e recebimentos e sinaliza crédito a devolver',async()=>{
 const o={...base(),fulfillment:'delivery',shippingFee:2000,total:15900,pricing:{baseTotal:16900,manualDiscount:1000},deliveryAddress:address,address:'Rua das Flores, 123',city:'Mauá',neighborhood:'Matriz',status:'Pronto aguardando entregador'};
 const {next,quote}=await change(o,input(o,{fulfillment:'pickup',pickupLocationId:'legacy'}));
 assert.equal(next.total,13900);assert.equal(next.shippingFee,0);assert.equal(next.pricing.baseTotal,14900);assert.equal(next.pricing.manualDiscount,1000);assert.equal(payments.paid(next),15900);assert.equal(next.refundRequired,true);assert.equal(quote.credit,2000);assert.equal(next.paymentStatus,'paid');assert.equal(next.pickupLocation.id,'legacy');assert.equal(next.status,'Pronto aguardando retirada');assert.equal(next.deliveryAddress,null);assert.equal(next.address,'');assert.equal(next.recipient,o.recipient);
 const again=await change(next,input(next,{fulfillment:'delivery'}));assert.equal(again.next.total,15900);assert.equal(payments.paid(again.next),15900);assert.equal(again.next.refundRequired,false);
});
test('troca valida vínculo do endereço, versão, frete de rota e fases encerradas',async()=>{
 const o=base();await assert.rejects(()=>change(o,input(o,{addressVersion:0})),/alterado/);await assert.rejects(()=>change({...o,customerId:randomUUID()},input(o)),/cliente/);
 const road=await change(o,input(o),{quoteDistance:async()=>({fee:3500,distanceMeters:1000})});assert.equal(road.next.shippingFee,3500);assert.equal(road.next.distanceQuote.distanceMeters,1000);
 await assert.rejects(()=>change({...o,status:'Cancelado'},input(o)),/encerrado/);await assert.rejects(()=>change({...o,status:'Saiu para entrega'},input(o)),/expedição/);
 const unchanged=await change({...o,scheduleMode:'now',date:'2026-10-31',period:'Tarde',timeSlot:''},input(o,{fulfillment:'pickup',scheduleMode:'now',date:'2099-01-01',timeSlot:''}));assert.equal(unchanged.next.date,'2026-10-31');assert.equal(unchanged.next.period,'Tarde');assert.equal(unchanged.next.version,0);
 const store=await change(o,input(o,{fulfillment:'store'}));assert.equal(store.next.status,'Concluído');assert.equal(store.next.shippingFee,0);
});
