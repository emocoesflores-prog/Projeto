require('dotenv').config();
const express=require('express'),helmet=require('helmet'),{rateLimit}=require('express-rate-limit'),sql=require('mssql'),{randomUUID,timingSafeEqual}=require('node:crypto');
const catalog=require('./catalog'),{schema,total}=require('./validation');
const {defaults,settingsSchema}=require('./store-settings');
let demoSettings={...defaults};
async function readSettings(){
 if(demo)return {...demoSettings};
 const result=await pool.request().query('SELECT deliveryFee FROM dbo.StoreSettings WHERE id=1');
 if(!result.recordset.length)throw Error('Configuração da loja ausente');
 return {...defaults,deliveryFee:result.recordset[0].deliveryFee};
}
const app=express(),demo=process.env.DATA_MODE==='demo',orders=[];let pool;
app.use(helmet());app.use(express.json({limit:'24kb'}));app.use('/api',rateLimit({windowMs:60000,limit:60}));
app.get('/api/health',(req,res)=>res.json({status:'ok',mode:demo?'demo':'sqlserver'}));
app.get('/api/store-settings',async(req,res,next)=>{try{res.set('Cache-Control','no-store').json(await readSettings())}catch(e){next(e)}});
app.get('/api/products',(req,res)=>res.json(catalog));
app.post('/api/orders',async(req,res,next)=>{try{const result=schema.safeParse(req.body);if(!result.success)return res.status(400).json({error:'Confira os dados de entrega e os itens do pedido.'});const data=result.data;const settings=await readSettings();const shippingFee=data.fulfillment==='pickup'?0:settings.deliveryFee;let amount;try{amount=total(data.items,catalog,data.fulfillment,shippingFee)}catch{return res.status(400).json({error:'Produto indisponível'})}const order={id:randomUUID(),createdAt:new Date().toISOString(),status:'Aguardando pagamento',paymentStatus:'pending',shippingFee,total:amount,...data};if(demo)orders.push(order);else await pool.request().input('id',sql.UniqueIdentifier,order.id).input('total',sql.Int,amount).input('payload',sql.NVarChar(sql.MAX),JSON.stringify({...data,paymentStatus:'pending',shippingFee})).query("INSERT INTO dbo.Orders(id,total,status,payload) VALUES(@id,@total,'Aguardando pagamento',@payload)");res.status(201).json({id:order.id,total:amount,shippingFee,paymentStatus:'pending',paymentAvailable:false,mode:demo?'demo':'sqlserver'});}catch(e){next(e)}});
app.use('/api/admin',(req,res,next)=>{const expected=process.env.ADMIN_TOKEN;const given=(req.headers.authorization||'').replace(/^Bearer /,'');if(!expected||Buffer.byteLength(given)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(given),Buffer.from(expected)))return res.status(401).json({error:'Acesso não autorizado'});next()});
app.put('/api/admin/store-settings',async(req,res,next)=>{try{
 const parsed=settingsSchema.safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:'Informe uma taxa válida entre R$ 0 e R$ 1.000.'});
 if(demo)demoSettings={...demoSettings,...parsed.data};
 else await pool.request().input('fee',sql.Int,parsed.data.deliveryFee).query('UPDATE dbo.StoreSettings SET deliveryFee=@fee WHERE id=1');
 res.set('Cache-Control','no-store').json({...defaults,...parsed.data});
}catch(e){next(e)}});
app.get('/api/admin/orders',async(req,res,next)=>{try{if(demo)return res.json(orders);const r=await pool.request().query('SELECT TOP(200) * FROM dbo.Orders ORDER BY createdAt DESC');res.json(r.recordset.map(({payload,...o})=>({...JSON.parse(payload),...o})));}catch(e){next(e)}});
app.patch('/api/admin/orders/:id',async(req,res,next)=>{try{const states=['Aguardando pagamento','Cancelado'];if(!states.includes(req.body.status)||!require('zod').z.uuid().safeParse(req.params.id).success)return res.status(400).json({error:'Dados inválidos'});if(demo){const order=orders.find(o=>o.id===req.params.id);if(!order)return res.sendStatus(404);order.status=req.body.status;}else{const r=await pool.request().input('id',sql.UniqueIdentifier,req.params.id).input('status',sql.NVarChar(40),req.body.status).query('UPDATE dbo.Orders SET status=@status WHERE id=@id');if(!r.rowsAffected[0])return res.sendStatus(404)}res.sendStatus(204)}catch(e){next(e)}});
app.use(express.static('public'));app.use((err,req,res,next)=>{console.error(err.message);res.status(500).json({error:'Não foi possível concluir. Tente novamente.'})});
async function start(){if(!demo){if(process.env.DATA_MODE!=='sqlserver')throw Error('Defina DATA_MODE=demo ou sqlserver');pool=await sql.connect({server:process.env.SQL_HOST,port:Number(process.env.SQL_PORT||1433),database:process.env.SQL_DATABASE,user:process.env.SQL_USER,password:process.env.SQL_PASSWORD,options:{encrypt:true,trustServerCertificate:process.env.SQL_TRUST_CERTIFICATE==='true'}});await pool.request().query(require('fs').readFileSync('sql/schema.sql','utf8'));}app.listen(process.env.PORT||3000,()=>console.log(`Floricultura iniciada (${demo?'DEMONSTRAÇÃO SEM PERSISTÊNCIA':'SQL Server'})`))}
if(require.main===module)start().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports=app;
