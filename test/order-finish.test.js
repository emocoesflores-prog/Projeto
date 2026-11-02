const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const payment=require('../public/payment-model'),flow=require('../public/order-flow'),{applyMutation}=require('../order-domain');
const base=()=>({id:randomUUID(),version:0,status:'Em preparação',workshopStartedAt:new Date().toISOString(),createdAt:new Date().toISOString(),customer:'Cliente Teste',phone:'11988887777',recipient:'Destinatário Original',recipientPhone:'11977776666',fulfillment:'delivery',city:'Mauá',address:'Rua das Flores, 100',neighborhood:'Matriz',date:'2099-01-01',period:'Manhã',scheduleMode:'scheduled',timeSlot:'09:00 - 11:00',occasion:'Sem ocasião específica',message:'Com carinho',anonymous:false,flowerNotes:'',deliveryNotes:'',substitution:'contact',total:14900,paymentStatus:'paid',paymentMethod:'pix',checklist:{arrangement:true,card:true,packaging:true},history:[]});
test('lista distingue pago, pendente e parcial pelo valor recebido, inclusive legado e cancelamento',()=>{
 const o=base();assert.deepEqual(payment.summary({...o,paymentStatus:'pending'}),{state:'pending',label:'PENDENTE',received:0,balance:14900});assert.deepEqual(payment.summary(o),{state:'paid',label:'PAGO',received:14900,balance:0});
 assert.deepEqual(payment.summary({...o,paymentStatus:'partial',receipts:[{amount:4000}]}),{state:'partial',label:'PARCIAL',received:4000,balance:10900});
 assert.equal(payment.summary({...o,status:'Cancelado',refundRequired:true}).label,'PAGO');assert.equal(payment.summary({...o,paymentStatus:'paid',receipts:[]}).state,'pending');
});
test('destinatário é alterado em conjunto com telefone, versão e auditoria do operador',()=>{
 const o=base(),actor={id:randomUUID(),name:'Operadora Flores',role:'staff'},input={action:'field',field:'recipientContact',version:0,value:{recipient:'Nova Destinatária',recipientPhone:'11966665555'}},next=applyMutation(o,input,{actor});
 assert.equal(next.recipient,'Nova Destinatária');assert.equal(next.recipientPhone,'11966665555');assert.equal(next.checklist.card,false);assert.equal(next.total,o.total);assert.equal(next.customer,o.customer);assert.equal(next.address,o.address);assert.equal(next.version,1);
 const repaired=applyMutation({...o,address:'',city:''},input,{actor});assert.equal(repaired.recipient,'Nova Destinatária');assert.equal(repaired.address,'');assert.equal(flow.hasDestination(repaired),false);
 const e=next.history.at(-1);assert.equal(e.actor,actor.name);assert.equal(e.actorId,actor.id);assert.ok(e.changes.some(c=>c.field==='recipient'&&c.before===o.recipient&&c.after===next.recipient));assert.ok(e.changes.some(c=>c.field==='recipientPhone'&&c.before===o.recipientPhone));
 assert.throws(()=>applyMutation(next,input,{actor}),/outra tela/);assert.throws(()=>applyMutation(o,{...input,value:{...input.value,total:1}},{actor}),/campos/);assert.throws(()=>applyMutation(o,{...input,value:{recipient:'Nova Pessoa',recipientPhone:'abc'}},{actor}));assert.throws(()=>applyMutation(o,{...input,value:{recipient:'Nova Pessoa',recipientPhone:'----------'}},{actor}),/telefone/);assert.throws(()=>applyMutation({...o,status:'Concluído'},input,{actor}),/encerrado/);
});
test('um endereço antigo completo continua válido sem snapshot, mas destino vazio impede despacho',()=>{
 const o={...base(),status:'Pronto aguardando entregador',driver:'Entregador Teste'};
 assert.equal(flow.hasDestination(o),true);const next=applyMutation(o,{action:'status',version:0,status:'Saiu para entrega'});assert.equal(next.status,'Saiu para entrega');
 for(const fields of [{address:''},{city:''},{address:'Rua'}])assert.throws(()=>applyMutation({...o,...fields},{action:'status',version:0,status:'Saiu para entrega'}),/endereço completo/);
 assert.equal(flow.hasDestination({...o,fulfillment:'pickup',address:'',city:''}),true);
 // A operação pode preparar flores enquanto o endereço é confirmado; o despacho exige o destino.
 assert.equal(applyMutation({...base(),status:'Aguardando preparação',address:'',city:''},{action:'status',version:0,status:'Em preparação'}).status,'Em preparação');
});
