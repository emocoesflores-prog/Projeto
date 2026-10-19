const sql=require('mssql');
const {normalizeOrder,applyMutation,OrderError}=require('./order-domain');
function decode(row){const {payload,...columns}=row;return normalizeOrder({...JSON.parse(payload),...columns})}
function createOrderStore({demo,getPool,getTenant=()=>require('./tenant-context').DEFAULT_TENANT,multi=false}){
 const partitions=new Map();const rows=()=>{const key=getTenant();if(!partitions.has(key))partitions.set(key,[]);return partitions.get(key)};
 const scoped=request=>multi?request.input('tenantId',sql.UniqueIdentifier,getTenant()):request;
 return {
  async get(id){if(demo){const o=rows().find(o=>o.id===id);return o?normalizeOrder(o):null;}const r=await scoped(getPool().request()).input('id',sql.UniqueIdentifier,id).query('SELECT * FROM dbo.Orders WHERE id=@id'+(multi?' AND tenantId=@tenantId':''));return r.recordset[0]?decode(r.recordset[0]):null;},
  async byPhone(phone,offset=0){
   const key=require('./contact').normalizePhone(phone);if(!key)throw new OrderError('Telefone inválido.',400);
   const limit=30;let result;
   if(demo)result=rows().filter(o=>require('./contact').normalizePhone(o.phone||'')===key).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))||b.id.localeCompare(a.id)).slice(offset,offset+limit+1).map(normalizeOrder);
   else {const r=await scoped(getPool().request()).input('phone',sql.VarChar(13),key).input('local',sql.VarChar(11),key.slice(2)).input('offset',sql.Int,offset).query("SELECT * FROM dbo.Orders WHERE "+(multi?'tenantId=@tenantId AND ':'')+"REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(JSON_VALUE(payload,'$.phone'),''),'+',''),' ',''),'(',''),')',''),'-',''),'.','') IN (@phone,@local) ORDER BY createdAt DESC,id DESC OFFSET @offset ROWS FETCH NEXT 31 ROWS ONLY");result=r.recordset.map(decode);}
   return {orders:result.slice(0,limit),nextOffset:result.length>limit?offset+limit:null};
  },
  async analytics(from,to){const limit=5000;if(demo){const selected=rows().filter(o=>o.createdAt>=from.toISOString()&&o.createdAt<to.toISOString());return {orders:selected.slice(0,limit).map(normalizeOrder),truncated:selected.length>limit};}const result=await scoped(getPool().request()).input('from',sql.DateTime2,from).input('to',sql.DateTime2,to).query('SELECT TOP(5001) * FROM dbo.Orders WHERE createdAt>=@from AND createdAt<@to'+(multi?' AND tenantId=@tenantId':'')+' ORDER BY createdAt DESC');return {orders:result.recordset.slice(0,limit).map(decode),truncated:result.recordset.length>limit};},
  async list(){if(demo)return rows().map(normalizeOrder);const result=await scoped(getPool().request()).query('SELECT TOP(200) * FROM dbo.Orders'+(multi?' WHERE tenantId=@tenantId':'')+' ORDER BY createdAt DESC');return result.recordset.map(decode)},
  async insert(order){if(demo){rows().push(order);return}await scoped(getPool().request()).input('id',sql.UniqueIdentifier,order.id).input('total',sql.Int,order.total).input('status',sql.NVarChar(40),order.status).input('payload',sql.NVarChar(sql.MAX),JSON.stringify(order)).query(multi?'INSERT INTO dbo.Orders(tenantId,id,total,status,payload) VALUES(@tenantId,@id,@total,@status,@payload)':'INSERT INTO dbo.Orders(id,total,status,payload) VALUES(@id,@total,@status,@payload)')},
  async mutate(id,input){
   if(demo){const i=rows().findIndex(o=>o.id===id);if(i<0)throw new OrderError('Pedido não encontrado.',404);const next=applyMutation(rows()[i],input);rows()[i]=next;return next}
   const tx=new sql.Transaction(getPool());await tx.begin();
   try{
    const result=await scoped(new sql.Request(tx)).input('id',sql.UniqueIdentifier,id).query('SELECT * FROM dbo.Orders WITH (UPDLOCK, HOLDLOCK) WHERE id=@id'+(multi?' AND tenantId=@tenantId':''));
    if(!result.recordset.length)throw new OrderError('Pedido não encontrado.',404);
    const next=applyMutation(decode(result.recordset[0]),input);
    await scoped(new sql.Request(tx)).input('id',sql.UniqueIdentifier,id).input('status',sql.NVarChar(40),next.status).input('payload',sql.NVarChar(sql.MAX),JSON.stringify(next)).query('UPDATE dbo.Orders SET status=@status,payload=@payload WHERE id=@id'+(multi?' AND tenantId=@tenantId':''));
    await tx.commit();return next;
   }catch(error){try{await tx.rollback()}catch{}throw error}
  }
 };
}
module.exports={createOrderStore};
