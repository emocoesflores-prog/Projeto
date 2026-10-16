const sql=require('mssql');
const {normalizeOrder,applyMutation,OrderError}=require('./order-domain');
function decode(row){const {payload,...columns}=row;return normalizeOrder({...JSON.parse(payload),...columns})}
function createOrderStore({demo,getPool}){
 const orders=[];
 return {
  async list(){if(demo)return orders.map(normalizeOrder);const result=await getPool().request().query('SELECT TOP(200) * FROM dbo.Orders ORDER BY createdAt DESC');return result.recordset.map(decode)},
  async insert(order){if(demo){orders.push(order);return}await getPool().request().input('id',sql.UniqueIdentifier,order.id).input('total',sql.Int,order.total).input('status',sql.NVarChar(40),order.status).input('payload',sql.NVarChar(sql.MAX),JSON.stringify(order)).query('INSERT INTO dbo.Orders(id,total,status,payload) VALUES(@id,@total,@status,@payload)')},
  async mutate(id,input){
   if(demo){const i=orders.findIndex(o=>o.id===id);if(i<0)throw new OrderError('Pedido não encontrado.',404);const next=applyMutation(orders[i],input);orders[i]=next;return next}
   const tx=new sql.Transaction(getPool());await tx.begin();
   try{
    const result=await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).query('SELECT * FROM dbo.Orders WITH (UPDLOCK, HOLDLOCK) WHERE id=@id');
    if(!result.recordset.length)throw new OrderError('Pedido não encontrado.',404);
    const next=applyMutation(decode(result.recordset[0]),input);
    await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('status',sql.NVarChar(40),next.status).input('payload',sql.NVarChar(sql.MAX),JSON.stringify(next)).query('UPDATE dbo.Orders SET status=@status,payload=@payload WHERE id=@id');
    await tx.commit();return next;
   }catch(error){try{await tx.rollback()}catch{}throw error}
  }
 };
}
module.exports={createOrderStore};
