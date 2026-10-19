const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const ops=require('../shop-operations'),categories=require('../shop-categories'),routing=require('../shop-routing');
const t=()=>({id:randomUUID(),slug:'loja',name:'Loja Teste',profile:{}});
const apply=(tenant,action,data,context)=>ops.applyOperations(tenant,{action,version:ops.state(tenant).revision,data},context);
test('categorias preservam legado, aceitam várias associações e rejeitam outra loja e ciclos',()=>{
 let a=t(),b=t();assert.equal(categories.catalog(a).length,6);assert.equal(categories.catalog(a)[0].categories[0],'Buquês');
 a=apply(a,'category.save',{name:'Romance',parentId:null,active:true}).tenant;const parent=ops.state(a).categories.find(c=>c.name==='Romance');
 a=apply(a,'category.save',{name:'Rosas importadas',parentId:parent.id,active:true}).tenant;const sub=ops.state(a).categories.find(c=>c.parentId===parent.id);
 assert.throws(()=>apply(b,'category.save',{name:'Filha externa',parentId:parent.id,active:true}));
 assert.throws(()=>apply(a,'category.save',{id:parent.id,name:parent.name,parentId:sub.id,active:true}));
 const product={id:1,name:'Produto Teste',categoryIds:[sub.id,ops.state(a).categories.find(c=>c.name==='Buquês').id],description:'Flores',price:12300,active:true,image:'',color:'#abcdef'};
 a=apply(a,'product.save',product).tenant;assert.deepEqual(categories.catalog(a)[0].categories,['Romance › Rosas importadas','Romance','Buquês']);
 assert.throws(()=>apply(b,'product.save',product));
 a=apply(a,'category.save',{...parent,active:false}).tenant;assert.deepEqual(categories.catalog(a)[0].categories,['Buquês']);
 assert.equal(categories.catalog(b)[0].name,'Buquê Aurora');
});
test('rotas conferem pertencimento, pagamento, versões, período e dupla atribuição',async()=>{
 let a=t();a=apply(a,'driver.save',{name:'Entregador A',phone:'11999999999',vehicle:'Moto',plate:'ABC1D23',active:true,notes:''}).tenant;const driver=ops.state(a).drivers[0];
 const order={id:randomUUID(),version:0,customer:'Cliente',recipient:'Pessoa',date:'2099-01-01',period:'Manhã',timeSlot:'09:00 - 12:00',status:'Pronto',paymentStatus:'paid',fulfillment:'delivery',address:'Rua Teste, 1',city:'Mauá',driver:'',checklist:{arrangement:true,card:true,packaging:true},history:[]};
 const input={origin:{lat:-23.65,lng:-46.46},start:'2099-01-01T08:00:00-03:00',stops:[{orderId:order.id,location:{lat:-23.66,lng:-46.47}}]};
 await assert.rejects(routing.plan(input,[]),/prontos/);const plan=await routing.plan(input,[order]);assert.equal(plan.method,'straight-line');assert.equal(plan.stops[0].late,false);assert.ok(plan.warnings.length);
 assert.throws(()=>apply(a,'route.create',{planId:plan.planId,driverId:driver.id,name:'Rota 1'},{plan,orders:[{...order,version:1}]}),e=>e.status===409);
 let result=apply(a,'route.create',{planId:plan.planId,driverId:driver.id,name:'Rota 1'},{plan,orders:[order]});a=result.tenant;const route=ops.state(a).routes[0];
 assert.throws(()=>apply(a,'route.create',{planId:plan.planId,driverId:driver.id,name:'Rota repetida'},{plan,orders:[order]}),/outra rota/);
 result=apply(a,'route.dispatch',{id:route.id},{orders:[order]});a=result.tenant;assert.equal(result.orders[0].status,'Saiu para entrega');assert.equal(result.orders[0].driverId,driver.id);
 result=apply(a,'route.deliver',{id:route.id,orderId:order.id},{orders:result.orders});assert.equal(result.orders[0].status,'Entregue');assert.equal(ops.state(result.tenant).routes[0].status,'completed');
});
test('cupons e agenda são validados, caixa é estornado sem excluir histórico',()=>{
 let a=t();a=apply(a,'cash.add',{type:'expense',amount:2500,date:'2026-10-19',category:'Insumos',method:'pix',description:'Compra de embalagens'}).tenant;const original=ops.state(a).cashEntries[0];a=apply(a,'cash.reverse',{id:original.id,reason:'Lançamento incorreto'}).tenant;assert.equal(ops.state(a).cashEntries.length,2);assert.equal(ops.state(a).cashEntries[1].reverses,original.id);assert.throws(()=>apply(a,'cash.reverse',{id:original.id,reason:'Repetir'}));
 assert.throws(()=>apply(a,'coupon.save',{code:'TESTE',type:'percent',value:101,minimum:0,starts:'2026-01-01',ends:'2026-12-31',limit:1,active:true}));
 const schedule={...ops.state(a).schedule,enabled:true,slots:[{label:'09:00 - 11:00',modes:['delivery']}],days:[1],horizonDays:30};
 a=apply(a,'schedule.save',schedule).tenant;
 const rules=require('../public/shop-rules'),now=new Date('2026-10-19T10:00:00-03:00');assert.equal(rules.issue(schedule,{scheduleMode:'scheduled',fulfillment:'delivery',date:'2026-10-19',timeSlot:'09:00 - 11:00'},now),null);assert.match(rules.issue(schedule,{scheduleMode:'scheduled',fulfillment:'pickup',date:'2026-10-19',timeSlot:'09:00 - 11:00'},now),/modalidade/);
});
test('serviço rodoviário usa matriz, geometria e cotação por distância sem confiar em quilômetros do navegador',async()=>{
 const previous=global.fetch,calls=[];
 global.fetch=async(url,options)=>{calls.push({url,options});if(url.includes('/geocode/'))return Response.json({features:[{properties:{label:'Rua Teste, Mauá, SP',confidence:0.95},geometry:{coordinates:[-46.47,-23.66]}}]});if(url.includes('/matrix/'))return Response.json({distances:[[0,4000],[4000,0]],durations:[[0,600],[600,0]]});return Response.json({features:[{geometry:{type:'LineString',coordinates:[[-46.46,-23.65],[-46.47,-23.66]]},properties:{summary:{distance:4000,duration:600}}}]});};
 try{const order={id:randomUUID(),version:0,date:'2099-01-01',period:'Manhã',timeSlot:'09:00 - 12:00',status:'Pronto',paymentStatus:'paid',fulfillment:'delivery',address:'Rua Teste, Mauá',city:'Mauá'};const input={origin:{lat:-23.65,lng:-46.46},start:'2099-01-01T08:00:00-03:00',stops:[{orderId:order.id,location:{lat:-23.66,lng:-46.47}}]};const result=await routing.plan(input,[order],{key:'fake-test-key'});assert.equal(result.method,'road');assert.equal(result.km,4);assert.equal(result.travelMinutes,10);assert.equal(result.geometry.type,'LineString');assert.match(calls[0].url,/matrix/);assert.equal(calls[0].options.headers.Authorization,'fake-test-key');
 const distance={enabled:true,origin:input.origin,baseFee:500,perKm:200,minFee:1000,maxKm:10};const quote=await routing.quoteDistance({distance},'Rua Teste, 100, Mauá, SP','fake-test-key');assert.equal(quote.fee,1300);assert.equal(quote.km,4);await assert.rejects(routing.quoteDistance({distance:{...distance,maxKm:2}},'Rua Teste, 100, Mauá, SP','fake-test-key'),/fora da distância/);
 }finally{global.fetch=previous;}
});
