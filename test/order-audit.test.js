const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {applyMutation}=require('../order-domain'),{createOrderStore}=require('../order-store');
const audit=require('../order-events');
const actor={id:randomUUID(),name:'Operadora das Flores',role:'owner'};
const base=()=>({id:randomUUID(),version:0,createdAt:new Date().toISOString(),status:'Aguardando preparação',paymentStatus:'paid',customer:'Cliente Original',phone:'11988887777',recipient:'Pessoa Original',recipientPhone:'',fulfillment:'pickup',date:'2099-01-01',period:'Manhã',scheduleMode:'scheduled',timeSlot:'09:00 - 11:00',neighborhood:'',message:'',anonymous:false,occasion:'Sem ocasião específica',flowerNotes:'',deliveryNotes:'',substitution:'contact',total:10000,items:[{id:1,quantity:1}],history:[],checklist:{arrangement:false,card:false,packaging:false}});
test('lápis altera apenas o campo permitido, registra identidade confiável e valores, e recusa versão antiga',()=>{
 const original=base(),change={action:'field',version:0,field:'recipient',value:'Nova Pessoa'},next=applyMutation(original,change,{actor});
 assert.equal(next.recipient,'Nova Pessoa');assert.equal(next.phone,original.phone);assert.equal(next.total,original.total);assert.equal(next.checklist.card,false);
 const e=next.history.at(-1);assert.equal(e.actor,actor.name);assert.equal(e.actorId,actor.id);assert.equal(e.actorRole,'owner');assert.ok(Date.parse(e.at));assert.equal(e.orderVersion,1);assert.deepEqual(e.changes,[{field:'recipient',before:'Pessoa Original',after:'Nova Pessoa'}]);
 assert.throws(()=>applyMutation(next,change,{actor}),/outra tela/);
 for(const input of [{...change,field:'total',value:1},{...change,actor:'Invasor'},{...change,field:'phone',value:'abc'},{...change,field:'address',value:{city:'Mauá',address:'Rua inteira, 100',neighborhood:'Centro',total:1}}])assert.throws(()=>applyMutation(original,input,{actor}));
 assert.equal(applyMutation(next,{...change,version:1},{actor}).version,1);
 assert.throws(()=>applyMutation({...original,status:'Concluído'},change,{actor}),/encerrado/);
});
test('histórico separado mantém todas as alterações, pagina sem duplicar sob novos eventos e isola lojas',async()=>{
 let tenant=randomUUID();const firstTenant=tenant,store=createOrderStore({demo:true,getTenant:()=>tenant}),o=base();await store.insert(o);let next=o;
 for(let i=0;i<72;i++)next=await store.mutate(o.id,{action:'field',field:'deliveryNotes',value:'Orientação '+i,version:next.version},{actor});
 assert.equal(next.history.length,audit.CACHE_SIZE);assert.equal(next.historyCount,72);
 const first=await store.events(o.id);assert.equal(first.events.length,50);assert.equal(first.events[0].sequence,72);assert.equal(first.nextBefore,23);
 next=await store.mutate(o.id,{action:'field',field:'deliveryNotes',value:'Orientação posterior',version:next.version},{actor});
 const second=await store.events(o.id,first.nextBefore);assert.equal(second.events.length,22);assert.equal(second.nextBefore,null);assert.equal(second.events.at(-1).changes[0].after,'Orientação 0');assert.equal(new Set([...first.events,...second.events].map(e=>e.sequence)).size,72);
 tenant=randomUUID();await assert.rejects(store.events(o.id),{status:404});tenant=firstTenant;assert.equal((await store.events(o.id)).events[0].sequence,73);
});
test('migração gradual arquiva todos os eventos antigos e mantém cache limitado sem apagar atores originais',()=>{
 const o=base();o.history=Array.from({length:140},(_,i)=>({at:new Date().toISOString(),actor:'Operador antigo '+i,type:'details',description:'Evento '+i}));const events=audit.prepare(o);assert.equal(events.length,140);assert.equal(o.historyCount,140);assert.equal(o.history.length,20);assert.equal(events[0].actor,'Operador antigo 0');assert.equal(audit.prepare(o).length,0);
});
test('gravação SQL reverte o pedido quando falha a auditoria e usa a mesma transação e loja para ambos',async(t)=>{
 const sql=require('mssql'),o=base(),tenant=randomUUID(),txs=[];let fail=false;
 class Tx{constructor(){this.queries=[];txs.push(this);}async begin(){}async commit(){this.committed=true;}async rollback(){this.rolledBack=true;}}
 class Request{constructor(tx){this.tx=tx;this.values={};}input(k,type,v){this.values[k]=v;return this;}async query(q){this.tx.queries.push({q,values:this.values});if(q.startsWith('SELECT'))return {recordset:[{payload:JSON.stringify(o)}]};if(q.includes('INSERT INTO dbo.OrderEvents')&&fail)throw Error('audit unavailable');return {recordset:[]};}}
 const previous={Transaction:sql.Transaction,Request:sql.Request};sql.Transaction=Tx;sql.Request=Request;try{const store=createOrderStore({demo:false,multi:true,getPool:()=>({}),getTenant:()=>tenant}),data={action:'field',version:0,field:'phone',value:'11999998888'};
 await store.mutate(o.id,data,{actor});let tx=txs.at(-1);assert.equal(tx.committed,true);const insert=tx.queries.find(r=>r.q.includes('INSERT INTO dbo.OrderEvents'));assert.equal(insert.values.tenant,tenant);assert.equal(JSON.parse(insert.values.events)[0].changes[0].beforeJson,JSON.stringify({value:o.phone}));assert.match(insert.q,/INSERT INTO dbo.OrderEventChanges/);const update=tx.queries.find(r=>r.q.startsWith('UPDATE'));assert.equal(update.values.tenantId,tenant);assert.equal(JSON.parse(update.values.payload).historyCount,1);
 fail=true;await assert.rejects(store.mutate(o.id,data,{actor}),/audit unavailable/);tx=txs.at(-1);assert.equal(tx.rolledBack,true);assert.equal(tx.committed,undefined);assert.equal(tx.queries.some(r=>r.q.startsWith('UPDATE')),false);
 }finally{sql.Transaction=previous.Transaction;sql.Request=previous.Request;}
});
