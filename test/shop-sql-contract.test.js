const {test}=require('node:test'),assert=require('node:assert/strict'),sql=require('mssql');
const {randomUUID}=require('node:crypto');
test('SQL: configuração e cupom usam bloqueio da loja, transação e reversão em conflito',async()=>{
 const original={Transaction:sql.Transaction,Request:sql.Request},tenant={id:randomUUID(),name:'Loja SQL',slug:'loja-sql',active:true,profile:{}},transactions=[];
 class Tx{constructor(){this.queries=[];transactions.push(this);}async begin(level){this.level=level;}async commit(){this.committed=true;}async rollback(){this.rolledBack=true;}}
 class Request{constructor(tx){this.tx=tx;this.inputs={};}input(name,type,value){this.inputs[name]=value;return this;}async query(query){this.tx.queries.push({query,inputs:this.inputs});if(query.startsWith('SELECT * FROM dbo.Tenants'))return {recordset:[{...tenant,profile:JSON.stringify(tenant.profile)}]};return {recordset:[]};}}
 sql.Transaction=Tx;sql.Request=Request;
 try{const store=require('../platform-store').createPlatformStore({demo:false,getPool:()=>({})});await store.changeOperations(tenant.id,{action:'category.save',version:0,data:{name:'SQL Categoria',parentId:null,active:true}});let tx=transactions.at(-1);assert.equal(tx.level,sql.ISOLATION_LEVEL.SERIALIZABLE);assert.equal(tx.committed,true);assert.match(tx.queries[0].query,/UPDLOCK,HOLDLOCK/);assert.equal(tx.queries[0].inputs.id,tenant.id);assert.match(tx.queries.at(-1).query,/WHERE id=@id/);assert.equal(tx.queries.at(-1).inputs.id,tenant.id);
 const o={id:randomUUID(),items:[{id:1,quantity:1,unitPrice:14900}],total:14900,shippingFee:0,fulfillment:'store',scheduleMode:'now',paymentMethod:'pix',status:'Aguardando pagamento'};
 await store.insertShopOrder(tenant.id,o,{expectedTotal:14900});tx=transactions.at(-1);assert.equal(tx.committed,true);const insert=tx.queries.find(q=>q.query.startsWith('INSERT INTO dbo.Orders'));assert.match(insert.query,/tenantId/);assert.equal(insert.inputs.tenant,tenant.id);
 await assert.rejects(store.insertShopOrder(tenant.id,o,{expectedTotal:1}),e=>e.status===409);tx=transactions.at(-1);assert.equal(tx.rolledBack,true);assert.equal(tx.committed,undefined);assert.equal(tx.queries.some(q=>q.query.startsWith('INSERT')),false);
 }finally{sql.Transaction=original.Transaction;sql.Request=original.Request;}
});
