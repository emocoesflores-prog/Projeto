/* Migração opcional, retomável, de um pedido por transação. */
require('dotenv').config();
const fs=require('node:fs'),path=require('node:path'),sql=require('mssql'),audit=require('../order-events');
async function migrate(){
 if(process.env.DATA_MODE!=='sqlserver')throw Error('Este comando exige DATA_MODE=sqlserver no .env da instalação atual.');
 for(const key of ['SQL_HOST','SQL_DATABASE','SQL_USER','SQL_PASSWORD'])if(!process.env[key])throw Error('Preencha '+key+' no .env local.');
 const pool=await new sql.ConnectionPool({server:process.env.SQL_HOST,port:Number(process.env.SQL_PORT||1433),database:process.env.SQL_DATABASE,user:process.env.SQL_USER,password:process.env.SQL_PASSWORD,options:{encrypt:true,trustServerCertificate:process.env.SQL_TRUST_CERTIFICATE==='true'}}).connect();
 try{
  await pool.request().query(fs.readFileSync(path.join(__dirname,'../sql/order-events.sql'),'utf8'));
  const multi=!!(await pool.request().query("SELECT COL_LENGTH(N'dbo.Orders',N'tenantId') AS size")).recordset[0].size;
  let count=0,after=null;
  for(;;){
   const rows=(await pool.request().input('after',sql.UniqueIdentifier,after).query("SELECT TOP(50) id FROM dbo.Orders WHERE (@after IS NULL OR id>@after) AND JSON_VALUE(payload,'$.historyCount') IS NULL ORDER BY id OPTION(RECOMPILE)")).recordset;
   if(!rows.length)break;
   for(const row of rows){
    const tx=new sql.Transaction(pool);await tx.begin();try{
     const record=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,row.id).query("SELECT * FROM dbo.Orders WITH(UPDLOCK,HOLDLOCK) WHERE id=@id AND JSON_VALUE(payload,'$.historyCount') IS NULL")).recordset[0];
     if(record){const order=require('../order-store').decode(record);await audit.append(tx,multi?record.tenantId:require('../tenant-context').DEFAULT_TENANT,order);await new sql.Request(tx).input('id',sql.UniqueIdentifier,row.id).input('payload',sql.NVarChar(sql.MAX),JSON.stringify(order)).query('UPDATE dbo.Orders SET payload=@payload WHERE id=@id');count++;}
     await tx.commit();
    }catch(error){try{await tx.rollback()}catch{}throw error;}
   }
   after=rows.at(-1).id;console.log('Pedidos com histórico separado: '+count);
  }
  console.log('Migração concluída. Histórico preservado; nenhum pedido ou cliente removido.');
 }finally{await pool.close();}
}
if(require.main===module)migrate().catch(error=>{console.error(error.code?'Migração interrompida ('+error.code+'). Confira conexão e permissões; os pedidos já migrados serão preservados.':error.message);process.exitCode=1;});
module.exports={migrate};
