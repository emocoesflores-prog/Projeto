const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createDraftStore,saveSchema}=require('../pdv-draft-store');
const sample=()=>({items:[{id:1,quantity:2,note:'Embrulhar com cuidado'}],customerId:null,customerName:'',query:'Cliente em digitação',address:null,timing:{mode:'now',date:'',slot:''},channel:'pdv',values:{fulfillment:'store',pickupLocationId:'',paymentMethod:'pix',occasion:'Sem ocasião específica',deliveryNotes:'Observação',flowerNotes:'',substitution:'contact',message:'Mensagem do cartão',anonymous:false,couponCode:''}});
test('resposta de encerramento de uma sessão antiga não limpa o rascunho da sessão seguinte',async()=>{
 const previous=global.fetch,{create}=require('../public/pdv-drafts');let release;
 global.fetch=async()=>{await new Promise(r=>release=r);return {ok:true,json:async()=>({})};};
 const session=create({auth:()=>({})});
 try{session.use({id:'old',version:1,data:{value:'antigo'}});const finishing=session.complete();await new Promise(r=>setImmediate(r));session.reset();session.use({id:'new',version:0,data:null});session.schedule({value:'novo'});release();await finishing;assert.equal(session.current.id,'new');assert.equal(session.unsaved,true);}finally{session.reset();global.fetch=previous;}
});
test('rascunhos incompletos ficam separados por loja e operador, sem aceitar valores financeiros forjados',async()=>{
 const store=createDraftStore({demo:true}),tenant=randomUUID(),user=randomUUID(),id=randomUUID(),data=sample();
 const saved=await store.save(tenant,user,id,{version:0,data});assert.equal(saved.version,1);assert.equal((await store.list(tenant,user))[0].itemCount,2);
 assert.equal((await store.list(randomUUID(),user)).length,0);assert.equal(await store.get(tenant,randomUUID(),id),null);
 assert.equal(saveSchema.safeParse({version:0,data:{...data,total:1}}).success,false);
 assert.equal(saveSchema.safeParse({version:0,data:{...data,items:[{id:1,quantity:1,note:'',unitPrice:1}]}}).success,false);
 data.values.message='Alterada';assert.equal((await store.get(tenant,user,id)).data.values.message,'Mensagem do cartão');
});
test('edições concorrentes não sobrescrevem e rascunhos encerrados não ressuscitam',async()=>{
 const store=createDraftStore({demo:true}),tenant=randomUUID(),user=randomUUID(),id=randomUUID(),data=sample();
 await store.save(tenant,user,id,{version:0,data});const pair=await Promise.allSettled([store.save(tenant,user,id,{version:1,data}),store.save(tenant,user,id,{version:1,data})]);assert.equal(pair.filter(r=>r.status==='fulfilled').length,1);assert.equal(pair.find(r=>r.status==='rejected').reason.status,409);
 const closed=await store.close(tenant,user,id,{version:2},randomUUID());assert.equal(closed.state,'converted');assert.deepEqual(closed.data,{});assert.equal((await store.list(tenant,user)).length,0);
 await assert.rejects(store.save(tenant,user,id,{version:3,data}),/encerrado/);
});
test('limite de rascunhos permite liberar uma vaga sem misturar operadores',async()=>{
 const store=createDraftStore({demo:true}),tenant=randomUUID(),user=randomUUID(),data=sample(),ids=[];
 for(let i=0;i<20;i++){const id=randomUUID();ids.push(id);await store.save(tenant,user,id,{version:0,data});}
 await assert.rejects(store.save(tenant,user,randomUUID(),{version:0,data}),/20 rascunhos/);
 await store.close(tenant,user,ids[0],{version:1});await store.save(tenant,user,randomUUID(),{version:0,data});assert.equal((await store.list(tenant,user)).length,20);
 await store.save(tenant,randomUUID(),randomUUID(),{version:0,data});
});
test('SQL do rascunho confere versão sob bloqueio e grava com filtro de loja e operador',async()=>{
 const sql=require('mssql'),previous={Request:sql.Request,Transaction:sql.Transaction},data=sample(),tenant=randomUUID(),user=randomUUID(),id=randomUUID(),txs=[];
 class Tx{constructor(){this.queries=[];txs.push(this);}async begin(){}async commit(){this.committed=true;}async rollback(){this.rolledBack=true;}}
 class Request{constructor(tx){this.tx=tx;this.values={};}input(n,t,v){this.values[n]=v;return this;}async query(q){this.tx.queries.push({q,values:this.values});if(q.startsWith('SELECT'))return {recordset:[{id:id.toUpperCase(),version:2,state:'active',createdAt:new Date(),updatedAt:new Date(),payload:JSON.stringify(data)}]};return {recordset:[]};}}
 sql.Request=Request;sql.Transaction=Tx;
 try{const store=createDraftStore({demo:false,getPool:()=>({})});await store.save(tenant,user,id,{version:2,data});const tx=txs[0],update=tx.queries.find(r=>r.q.startsWith('UPDATE'));assert.match(tx.queries[0].q,/UPDLOCK,HOLDLOCK/);assert.match(update.q,/tenantId=@tenant AND userId=@user AND id=@id/);assert.equal(update.values.tenant,tenant);assert.equal(update.values.user,user);assert.equal(update.values.version,3);assert.equal(tx.committed,true);await assert.rejects(store.save(tenant,user,id,{version:1,data}),/outra aba/);assert.equal(txs[1].rolledBack,true);assert.equal(txs[1].queries.length,1);}finally{sql.Request=previous.Request;sql.Transaction=previous.Transaction;}
});
test('autosave serializa digitação durante gravação, inclusive retorno ao valor anterior',async()=>{
 const previous=global.fetch,saved=[],{create}=require('../public/pdv-drafts');let release;
 global.fetch=async(url,options)=>{const body=JSON.parse(options.body);saved.push(body);if(saved.length===1)await new Promise(r=>release=r);return {ok:true,json:async()=>({id:'fixture',version:body.version+1,data:body.data,updatedAt:new Date().toISOString()})};};
 const session=create({auth:()=>({})});
 try{session.use({id:'fixture',version:1,data:{value:'A'}});session.schedule({value:'B'});const pending=session.flush();session.schedule({value:'A'});release();await pending;assert.deepEqual(saved.map(s=>s.data.value),['B','A']);assert.deepEqual(saved.map(s=>s.version),[1,2]);assert.equal(session.unsaved,false);}finally{session.reset();global.fetch=previous;}
});
test('autosave recupera resposta perdida e conserva alterações em conflito',async()=>{
 const previous=global.fetch,{create}=require('../public/pdv-drafts');let remote=null,lost=true;
 global.fetch=async(url,options)=>{if(options.method==='GET')return {ok:true,json:async()=>remote};const body=JSON.parse(options.body);if(remote)return {ok:false,status:409,json:async()=>({error:'Outra aba'})};remote={id:'fixture',version:1,data:body.data};if(lost){lost=false;throw Error('Resposta perdida');}return {ok:true,json:async()=>remote};};
 const session=create({auth:()=>({})});
 try{session.use({id:'fixture',version:0,data:null});session.schedule({value:'A'});await assert.rejects(session.flush(),/perdida/);await session.flush();assert.equal(session.current.version,1);assert.equal(session.unsaved,false);session.schedule({value:'B'});await assert.rejects(session.flush(),/Outra aba/);assert.equal(session.unsaved,true);assert.equal(session.error.status,409);}finally{session.reset();global.fetch=previous;}
});
