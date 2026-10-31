require('dotenv').config();
const fs=require('node:fs'),path=require('node:path'),sql=require('mssql');
async function migrate(){
 if(process.env.DATA_MODE!=='sqlserver')throw Error('Este comando exige DATA_MODE=sqlserver no .env da instalação que usa o banco.');
 for(const key of ['SQL_HOST','SQL_DATABASE','SQL_USER','SQL_PASSWORD'])if(!process.env[key])throw Error('Preencha '+key+' no .env local. Não envie credenciais pelo chat.');
 const pool=await new sql.ConnectionPool({server:process.env.SQL_HOST,port:Number(process.env.SQL_PORT||1433),database:process.env.SQL_DATABASE,user:process.env.SQL_USER,password:process.env.SQL_PASSWORD,options:{encrypt:true,trustServerCertificate:process.env.SQL_TRUST_CERTIFICATE==='true'}}).connect();
 try{
  const state=(await pool.request().query("SELECT DB_NAME() AS databaseName,OBJECT_ID(N'dbo.Orders',N'U') AS ordersTable,OBJECT_ID(N'dbo.Customers',N'U') AS customersTable")).recordset[0];
  if(state.databaseName!==process.env.SQL_DATABASE||!state.ordersTable||!state.customersTable)throw Error('O banco selecionado não corresponde à instalação esperada ou faltam as tabelas Orders/Customers. Nenhuma migração foi aplicada.');
  const counts=async()=> (await pool.request().query('SELECT (SELECT COUNT_BIG(*) FROM dbo.Orders) AS ordersCount,(SELECT COUNT_BIG(*) FROM dbo.Customers) AS customersCount')).recordset[0];
  const before=await counts();
  await pool.request().query(fs.readFileSync(path.join(__dirname,'../sql/multitenant.sql'),'utf8'));
  await pool.request().query(fs.readFileSync(path.join(__dirname,'../sql/product-events.sql'),'utf8'));
  await pool.request().query(fs.readFileSync(path.join(__dirname,'../sql/pdv-drafts.sql'),'utf8'));
  await pool.request().query(fs.readFileSync(path.join(__dirname,'../sql/order-events.sql'),'utf8'));
  const after=await counts();
  if(String(before.ordersCount)!==String(after.ordersCount)||String(before.customersCount)!==String(after.customersCount))throw Error('A migração terminou, mas a contagem mudou durante a verificação. Confira possíveis gravações concorrentes antes de iniciar o servidor.');
  const checked=(await pool.request().query("SELECT OBJECT_ID(N'dbo.AppUsers',N'U') AS usersTable,OBJECT_ID(N'dbo.AppSessions',N'U') AS sessionsTable,COL_LENGTH(N'dbo.Orders',N'tenantId') AS ordersTenant,COL_LENGTH(N'dbo.Customers',N'tenantId') AS customersTenant,(SELECT COUNT(*) FROM dbo.Tenants WHERE id='00000000-0000-4000-8000-000000000001') AS originalStore,(SELECT COUNT(*) FROM dbo.Tenants WHERE id='00000000-0000-4000-8000-000000000002') AS platformCompany")).recordset[0];
  if(!checked.usersTable||!checked.sessionsTable||!checked.ordersTenant||!checked.customersTenant||checked.originalStore!==1||checked.platformCompany!==1)throw Error('A verificação final do esquema não foi concluída. Confira o banco antes de iniciar.');
  console.log('Migração da plataforma aplicada. Pedidos e clientes existentes preservados e loja original confirmada.');
  console.log('Configure AUTH_MODE=multi no .env, execute npm start e cadastre o administrador principal em /inova.html.');
 }finally{await pool.close();}
}
if(require.main===module)migrate().catch(error=>{if(error.code)console.error('Não foi possível aplicar a migração ('+error.code+'). Confira acesso, conexão e permissão para alterar o esquema no SQL Server.');else console.error(error.message);process.exitCode=1;});
module.exports={migrate};
