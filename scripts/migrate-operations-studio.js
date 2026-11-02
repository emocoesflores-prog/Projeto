require('dotenv').config();
const fs=require('node:fs/promises'),path=require('node:path'),sql=require('mssql');
async function migrate(){
 if(process.env.DATA_MODE!=='sqlserver')throw Error('Este comando exige DATA_MODE=sqlserver no .env da instalação atual.');
 for(const key of ['SQL_HOST','SQL_DATABASE','SQL_USER','SQL_PASSWORD'])if(!process.env[key])throw Error('Preencha '+key+' no .env local.');
 const pool=await new sql.ConnectionPool({server:process.env.SQL_HOST,port:Number(process.env.SQL_PORT||1433),database:process.env.SQL_DATABASE,user:process.env.SQL_USER,password:process.env.SQL_PASSWORD,options:{encrypt:true,trustServerCertificate:process.env.SQL_TRUST_CERTIFICATE==='true'}}).connect();
 try{await pool.request().query(await fs.readFile(path.join(__dirname,'../sql/operations-studio.sql'),'utf8'));console.log('Tabelas de atendimento, equipe, acessos de entregadores e avisos instaladas. Pedidos, clientes e recebimentos preservados.');}finally{await pool.close();}
}
if(require.main===module)migrate().catch(error=>{console.error(error.code?'Não foi possível instalar as tabelas da operação. Confira a conexão e as permissões da conta do banco.':error.message);process.exitCode=1;});
module.exports={migrate};
