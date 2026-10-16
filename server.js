require('dotenv').config();
const express=require('express');
const helmet=require('helmet');
const {rateLimit}=require('express-rate-limit');
const sql=require('mssql');
const {randomUUID,timingSafeEqual}=require('node:crypto');
const {z}=require('zod');
const catalog=require('./catalog');
const {schema,total}=require('./validation');
const orderOptions=require('./public/order-options');
const {defaults,settingsSchema}=require('./store-settings');
const {OrderError}=require('./order-domain');
const {createOrderStore}=require('./order-store');
const {createCustomerStore}=require('./customer-store');
const {formatAddress}=require('./address-domain');
const lookupCep=require('./cep-service').createCepService();
const app=express(),demo=process.env.DATA_MODE==='demo';
let pool,demoSettings={...defaults};
const store=createOrderStore({demo,getPool:()=>pool});
const customers=createCustomerStore({demo,getPool:()=>pool});
async function readSettings(){
 if(demo)return {...demoSettings};
 const result=await pool.request().query('SELECT deliveryFee FROM dbo.StoreSettings WHERE id=1');
 if(!result.recordset.length)throw new Error('Configuração da loja ausente');
 return {...defaults,deliveryFee:result.recordset[0].deliveryFee};
}
app.use(helmet());
app.use(express.json({limit:'40kb'}));
app.use('/api',rateLimit({windowMs:60000,limit:120}));
app.use('/api/admin',(req,res,next)=>{res.set('Cache-Control','no-store');next()});
app.get('/api/health',(req,res)=>res.json({status:'ok',mode:demo?'demo':'sqlserver'}));
app.get('/api/store-settings',async(req,res,next)=>{try{res.set('Cache-Control','no-store').json(await readSettings())}catch(e){next(e)}});
app.get('/api/products',(req,res)=>res.json(catalog));
async function createOrder(body,source){
 if(!body||typeof body!=='object'||Array.isArray(body))throw new OrderError('Informe os dados do pedido.',400);
 if(source==='site'&&(body.fulfillment==='store'||body.scheduleMode==='now'))throw new OrderError('A loja online aceita apenas entrega ou retirada agendada.',400);
 const candidate={...body};
 let savedAddress=null;
 if(source==='manual'&&body.fulfillment==='delivery'&&(!body.customerId||!body.deliveryAddressId))throw new OrderError('Selecione um cliente e salve ou escolha o endereço de entrega.',400);
 if(source==='manual'&&body.customerId){
  if(!z.uuid().safeParse(body.customerId).success)throw new OrderError('Cadastro de cliente inválido.',400);
  const customer=await customers.get(body.customerId);
  if(!customer)throw new OrderError('Cliente não encontrado. Pesquise e selecione novamente.',404);
  candidate.customer=customer.name;candidate.phone=customer.phone;
  if(body.fulfillment==='delivery'){
   if(!z.uuid().safeParse(body.deliveryAddressId).success)throw new OrderError('Endereço de entrega inválido.',400);
   savedAddress=(customer.addresses||[]).find(address=>address.id===body.deliveryAddressId);
   if(!savedAddress)throw new OrderError('Este endereço não pertence ao cliente selecionado.',404);
   if(body.deliveryAddressVersion!==savedAddress.version)throw new OrderError('O endereço mudou. Reabra a entrega e selecione a versão atual.',409);
   candidate.recipient=savedAddress.recipient;candidate.recipientPhone=savedAddress.recipientPhone;
   candidate.address=formatAddress(savedAddress);candidate.city=savedAddress.city;
  }
 }

 if(source==='manual'&&candidate.scheduleMode==='now'){candidate.date=orderOptions.localDate();candidate.period=Number(orderOptions.localTime().slice(0,2))<12?'Manhã':'Tarde';candidate.timeSlot='';}
 const parsed=schema.safeParse(candidate);if(!parsed.success)throw new OrderError(parsed.error.issues[0]?.message||'Confira os dados do pedido.',400);
 const data=parsed.data;
 if(source==='manual'&&body.scheduleMode==='scheduled'&&!data.timeSlot)throw new OrderError('Escolha o dia e a faixa de horário do agendamento.',400);
 if(data.timeSlot&&orderOptions.expired(data.date,data.timeSlot))throw new OrderError('Esta faixa de horário já terminou. Escolha outro agendamento.',400);
 const settings=await readSettings();
 const shippingFee=data.fulfillment==='delivery'?settings.deliveryFee:0;
 let amount;try{amount=total(data.items,catalog,data.fulfillment,shippingFee)}catch{throw new OrderError('Produto indisponível.',400)}
 const now=new Date().toISOString();
 const items=data.items.map(item=>{const p=catalog.find(p=>p.id===item.id);return {...item,name:p.name,unitPrice:p.price}});
 const order={...data,...(savedAddress?{deliveryAddress:Object.fromEntries(Object.entries(savedAddress).filter(([key])=>key!=='history'))}:{}),...(source==='manual'&&body.customerId?{customerId:body.customerId}:{}),customer:data.customer||'Consumidor final',recipient:data.recipient||data.customer||'Consumidor final',customerIdentified:!!(data.customer||data.phone),items,id:randomUUID(),createdAt:now,version:0,source,status:'Aguardando pagamento',paymentStatus:'pending',shippingFee,total:amount,checklist:{arrangement:false,card:false,packaging:false},history:[{at:now,actor:source==='site'?'Cliente pelo site':'Administrador',type:'created',description:'Pedido registrado. Aguardando confirmação de recebimento.'}]};
 await store.insert(order);return order;
}
app.post('/api/orders',async(req,res,next)=>{try{const order=await createOrder(req.body,'site');res.status(201).json({id:order.id,total:order.total,shippingFee:order.shippingFee,paymentStatus:'pending',paymentAvailable:false,mode:demo?'demo':'sqlserver'})}catch(e){next(e)}});
app.use('/api/admin',(req,res,next)=>{
 const expected=process.env.ADMIN_TOKEN,given=(req.headers.authorization||'').replace(/^Bearer /,'');
 if(!expected||Buffer.byteLength(given)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(given),Buffer.from(expected)))return res.status(401).json({error:'Acesso não autorizado'});
 next();
});
app.get('/api/admin/cep/:cep',async(req,res,next)=>{try{res.json(await lookupCep(req.params.cep))}catch(error){next(error)}});
app.get('/api/admin/customers/:id/addresses',async(req,res,next)=>{try{
 if(!z.uuid().safeParse(req.params.id).success)throw new OrderError('Cliente inválido.',400);
 const customer=await customers.get(req.params.id);if(!customer)throw new OrderError('Cliente não encontrado.',404);res.json(customer.addresses||[]);
}catch(error){next(error)}});
app.post('/api/admin/customers/:id/addresses',async(req,res,next)=>{try{
 if(!z.uuid().safeParse(req.params.id).success)throw new OrderError('Cliente inválido.',400);
 res.status(201).json(await customers.saveAddress(req.params.id,req.body));
}catch(error){next(error)}});
app.patch('/api/admin/customers/:id/addresses/:addressId',async(req,res,next)=>{try{
 if(!z.uuid().safeParse(req.params.id).success||!z.uuid().safeParse(req.params.addressId).success)throw new OrderError('Cliente ou endereço inválido.',400);
 res.json(await customers.saveAddress(req.params.id,req.body,req.params.addressId));
}catch(error){next(error)}});
app.get('/api/admin/customers',async(req,res,next)=>{try{
 const query=typeof req.query.q==='string'?req.query.q.trim():'';
 if(query.length>120)throw new OrderError('Pesquise com até 120 caracteres.',400);
 res.json(await customers.search(query));
}catch(error){next(error)}});
app.get('/api/admin/customers/:id',async(req,res,next)=>{try{
 if(!z.uuid().safeParse(req.params.id).success)throw new OrderError('Cliente inválido.',400);
 const customer=await customers.get(req.params.id);if(!customer)throw new OrderError('Cliente não encontrado.',404);res.json(customer);
}catch(error){next(error)}});
app.post('/api/admin/customers',async(req,res,next)=>{try{res.status(201).json(await customers.insert(req.body))}catch(error){next(error)}});
app.put('/api/admin/store-settings',async(req,res,next)=>{try{
 const parsed=settingsSchema.safeParse(req.body);if(!parsed.success)throw new OrderError('Informe uma taxa válida entre R$ 0 e R$ 1.000.',400);
 if(demo)demoSettings={...demoSettings,...parsed.data};else await pool.request().input('fee',sql.Int,parsed.data.deliveryFee).query('UPDATE dbo.StoreSettings SET deliveryFee=@fee WHERE id=1');
 res.json({...defaults,...parsed.data});
}catch(e){next(e)}});
app.get('/api/admin/orders',async(req,res,next)=>{try{res.json(await store.list())}catch(e){next(e)}});
app.post('/api/admin/orders',async(req,res,next)=>{try{res.status(201).json(await createOrder(req.body,'manual'))}catch(e){next(e)}});
app.patch('/api/admin/orders/:id',async(req,res,next)=>{try{
 if(!z.uuid().safeParse(req.params.id).success)throw new OrderError('Código de pedido inválido.',400);
 res.json(await store.mutate(req.params.id,req.body));
}catch(e){next(e)}});
app.use(express.static('public'));
app.use((err,req,res,next)=>{
 if(err instanceof OrderError)return res.status(err.status).json({error:err.message});
 if(err.type==='entity.parse.failed')return res.status(400).json({error:'JSON inválido.'});
 console.error(err.message);res.status(500).json({error:'Não foi possível concluir. Tente novamente.'});
});
async function start(){
 if(!demo){
  if(process.env.DATA_MODE!=='sqlserver')throw new Error('Defina DATA_MODE=demo ou sqlserver');
  pool=await sql.connect({server:process.env.SQL_HOST,port:Number(process.env.SQL_PORT||1433),database:process.env.SQL_DATABASE,user:process.env.SQL_USER,password:process.env.SQL_PASSWORD,options:{encrypt:true,trustServerCertificate:process.env.SQL_TRUST_CERTIFICATE==='true'}});
  await pool.request().query(require('fs').readFileSync(require('path').join(__dirname,'sql/schema.sql'),'utf8'));
  const check=await pool.request().query("SELECT OBJECT_ID(N'dbo.Customers',N'U') AS customerTable");
  if(!check.recordset[0].customerTable)throw new Error('Cadastro de clientes ainda não instalado. No SSMS, selecione Floricultura e execute sql/customers.sql com uma conta autorizada. Depois inicie novamente.');
 }
 app.listen(process.env.PORT||3000,()=>console.log(`Floricultura iniciada (${demo?'DEMONSTRAÇÃO SEM PERSISTÊNCIA':'SQL Server'})`));
}
if(require.main===module)start().catch(async e=>{console.error(e.message);try{await sql.close()}catch{}process.exitCode=1});
module.exports=app;
