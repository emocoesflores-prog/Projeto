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
const app=express(),demo=process.env.DATA_MODE==='demo',multi=process.env.AUTH_MODE!=='legacy';
const {context,tenantId,DEFAULT_TENANT}=require('./tenant-context');
const platformStore=require('./platform-store').createPlatformStore({demo,getPool:()=>pool});
const tenantResources=require('./tenant-resources').createTenantResources({getIdentity:async id=>{const tenant=await platformStore.tenant(id);return {...tenant.profile,storeName:tenant.name,assistantName:tenant.profile.assistantName||(id===DEFAULT_TENANT?'Florzinha':'Assistente')};}});
const platformAuth=require('./platform-auth').createPlatformAuth(platformStore,{onTenantStopped:id=>tenantResources.stop(id)});
let pool,demoSettings={...defaults};
const store=createOrderStore({demo,getPool:()=>pool,getTenant:tenantId,multi});
const customers=createCustomerStore({demo,getPool:()=>pool,getTenant:tenantId,multi});
async function readSettings(){
 if(multi){const tenant=await platformStore.tenant(tenantId());if(!tenant?.active)throw new OrderError('Loja indisponível.',404);return {orderingBlocked:require('./finance').access(tenant).blocked&&require('./finance').access(tenant).blockSite,deliveryFee:tenant.profile.deliveryFee??defaults.deliveryFee,deliveryRates:tenant.profile.deliveryRates||[],pickupAddress:tenant.profile.pickupAddress||'',pickupLocations:tenant.profile.pickupLocations,assistantName:tenant.profile.assistantName||(tenant.id===DEFAULT_TENANT?'Florzinha':'Assistente'),deliveryCities:require('./tenant-context').policy(tenant).deliveryCities,name:tenant.name,slug:tenant.slug,city:tenant.profile.city||'',state:tenant.profile.state||'',phone:tenant.profile.phone||''};}
 if(demo)return {...demoSettings};
 const result=await pool.request().query('SELECT deliveryFee FROM dbo.StoreSettings WHERE id=1');
 if(!result.recordset.length)throw new Error('Configuração da loja ausente');
 return {...defaults,deliveryFee:result.recordset[0].deliveryFee};
}
app.use(helmet({contentSecurityPolicy:{directives:{imgSrc:["'self'","data:","blob:"],mediaSrc:["'self'","blob:"]}}}));
app.use(express.json({limit:'40kb'}));
const attendanceChannels=require('./channel-routes').createChannels();
app.use('/api/channels/oauth',attendanceChannels.callback);
app.use('/api',rateLimit({windowMs:60000,limit:300}));
if(multi){app.use('/api/auth',platformAuth.router);app.use('/api/platform',platformAuth.sameOrigin,platformAuth.platform);}
else app.get('/api/auth/state',(req,res)=>res.json({legacy:true,setupRequired:false}));
if(multi)app.use(['/api/products','/api/store-settings','/api/orders'],async(req,res,next)=>{try{let tenant;if(req.query.store!==undefined){if(typeof req.query.store!=='string')throw new OrderError('Loja inválida.',400);tenant=await platformStore.bySlug(req.query.store);}else{const account=await platformAuth.readSession(req);tenant=account?.user.role==='master'?await platformStore.tenant(DEFAULT_TENANT):account?.tenant||await platformStore.tenant(DEFAULT_TENANT);}if(!tenant?.active||tenant.id===require('./tenant-context').PLATFORM_TENANT)throw new OrderError('Loja indisponível.',404);context.run(require('./tenant-context').policy(tenant),next);}catch(e){next(e)}});
app.use('/api/admin',(req,res,next)=>{res.set('Cache-Control','no-store');next()});
app.get('/api/health',(req,res)=>res.json({status:'ok',mode:demo?'demo':'sqlserver'}));
app.get('/api/store-settings',async(req,res,next)=>{try{res.set('Cache-Control','no-store').json(await readSettings())}catch(e){next(e)}});
async function readCatalog(){if(!multi)return catalog;const tenant=await platformStore.tenant(tenantId());return tenant?.profile.catalog||catalog;}
app.get('/api/products',async(req,res,next)=>{try{res.json(await readCatalog())}catch(e){next(e)}});
async function createOrder(body,source){
 if(source==='site'&&multi){const tenant=await platformStore.tenant(tenantId()),financial=require('./finance').access(tenant);if(financial.blocked&&financial.blockSite)throw new OrderError('Esta floricultura está temporariamente indisponível para novos pedidos.',403);}
 const catalog=await readCatalog();
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
   candidate.address=formatAddress(savedAddress);candidate.city=savedAddress.city;candidate.neighborhood=savedAddress.neighborhood;
  }
 }

 if(source==='manual'&&candidate.scheduleMode==='now'){candidate.date=orderOptions.localDate();candidate.period=Number(orderOptions.localTime().slice(0,2))<12?'Manhã':'Tarde';candidate.timeSlot='';}
 const parsed=schema.safeParse(candidate);if(!parsed.success)throw new OrderError(parsed.error.issues[0]?.message||'Confira os dados do pedido.',400);
 const data=parsed.data;
 if(source==='manual'&&body.scheduleMode==='scheduled'&&!data.timeSlot)throw new OrderError('Escolha o dia e a faixa de horário do agendamento.',400);
 if(data.timeSlot&&orderOptions.expired(data.date,data.timeSlot))throw new OrderError('Esta faixa de horário já terminou. Escolha outro agendamento.',400);
 const settings=await readSettings();
 let pickupLocation;
 if(data.fulfillment==='pickup'){const points=require('./public/pickup-locations').list(settings);pickupLocation=points.find(p=>p.id===data.pickupLocationId);if(!pickupLocation&&points.length>1)throw new OrderError('Selecione um local de retirada válido.',400);if(!pickupLocation&&data.pickupLocationId)throw new OrderError('O local de retirada mudou. Confira e selecione novamente.',400);pickupLocation||=points[0];if(pickupLocation)pickupLocation={...pickupLocation,formattedAddress:require('./public/pickup-locations').format(pickupLocation)};}
 const quote=require('./public/delivery-rates').quote(settings,data.city,data.neighborhood);if(data.fulfillment==='delivery'&&quote.fee===null)throw new OrderError(quote.error,400);
 const shippingFee=data.fulfillment==='delivery'?quote.fee:0;
 let amount;try{amount=total(data.items,catalog,data.fulfillment,shippingFee)}catch{throw new OrderError('Produto indisponível.',400)}
 const now=new Date().toISOString();
 const items=data.items.map(item=>{const p=catalog.find(p=>p.id===item.id);return {...item,name:p.name,unitPrice:p.price}});
 const order={...data,...(pickupLocation?{pickupLocation,pickupLocationId:pickupLocation.id}:{}),...(savedAddress?{deliveryAddress:Object.fromEntries(Object.entries(savedAddress).filter(([key])=>key!=='history'))}:{}),...(source==='manual'&&body.customerId?{customerId:body.customerId}:{}),customer:data.customer||'Consumidor final',recipient:data.recipient||data.customer||'Consumidor final',customerIdentified:!!(data.customer||data.phone),items,id:randomUUID(),createdAt:now,version:0,source,status:'Aguardando pagamento',paymentStatus:'pending',shippingFee,total:amount,checklist:{arrangement:false,card:false,packaging:false},history:[{at:now,actor:source==='site'?'Cliente pelo site':'Administrador',type:'created',description:'Pedido registrado. Aguardando confirmação de recebimento.'}]};
 await store.insert(order);return order;
}
app.post('/api/orders',async(req,res,next)=>{try{const order=await createOrder(req.body,'site');res.status(201).json({id:order.id,total:order.total,shippingFee:order.shippingFee,paymentStatus:'pending',paymentAvailable:false,mode:demo?'demo':'sqlserver'})}catch(e){next(e)}});
app.use('/api/admin',(req,res,next)=>{
 if(multi)return platformAuth.sameOrigin(req,res,()=>platformAuth.authenticate(req,res,()=>req.account.user.role==='master'?res.status(403).json({error:'Use o painel Floriculturas para administrar a plataforma. A operação pertence ao acesso de cada loja.'}):next()));
 const expected=process.env.ADMIN_TOKEN,given=(req.headers.authorization||'').replace(/^Bearer /,'');
 if(!expected||Buffer.byteLength(given)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(given),Buffer.from(expected)))return res.status(401).json({error:'Acesso não autorizado'});
 next();
});
const whatsappService = require('./whatsapp-service').createWhatsAppService();
const legacyWhatsAppRouter=require('./whatsapp-routes')(whatsappService);
app.use('/api/admin/channels',attendanceChannels.router);
app.use('/api/admin/whatsapp',async(req,res,next)=>{try{const router=multi?(await tenantResources.get(req.account.user.tenantId)).router:legacyWhatsAppRouter;router(req,res,next);}catch(e){next(e)}});
app.get('/api/admin/performance',async(req,res,next)=>{try{const analytics=require('./analytics'),period=analytics.range(req.query);const [result,clients,products,settings]=await Promise.all([store.analytics(period.from,period.to),customers.analytics(period.from,period.to),readCatalog(),readSettings()]);res.json(analytics.summarize(result.orders,products,clients,period.labels,{truncated:result.truncated,pickupLocations:require('./public/pickup-locations').list(settings)}));}catch(e){next(e)}});
const localities=require('./locality-service').createLocalityService();
app.get('/api/admin/locations/cities',(req,res)=>{if(typeof (req.query.q||'')!=='string'||String(req.query.q||'').length>100)return res.status(400).json({error:'Pesquise uma cidade com até 100 caracteres.'});res.json(localities.searchCities(req.query.q||'',String(req.query.state||'').slice(0,2)));});
app.get('/api/admin/locations/cities/:id/neighborhoods',async(req,res,next)=>{try{res.json(await localities.neighborhoods(req.params.id))}catch(e){next(e)}});
app.get('/api/admin/delivery-settings',async(req,res,next)=>{try{res.json(await readSettings())}catch(e){next(e)}});
app.put('/api/admin/delivery-settings',async(req,res,next)=>{try{
 if(!multi)throw new OrderError('Ative o modo de plataforma para configurar entregas por cidade e bairro.',400);
 const parsed=require('./delivery-settings').deliverySettingsSchema.safeParse(req.body);if(!parsed.success)throw new OrderError(parsed.error.issues[0]?.message||'Confira as taxas de entrega.',400);
 const profile={...parsed.data,deliveryCities:[...new Set(parsed.data.deliveryRates.map(r=>r.city))],deliveryFee:0};
 if(parsed.data.pickupLocations!==undefined)profile.pickupAddress=parsed.data.pickupLocations.length?require('./public/pickup-locations').format(parsed.data.pickupLocations[0]):'';else if(parsed.data.pickupAddress!==undefined)profile.pickupLocations=undefined;
 await platformStore.saveTenant(tenantId(),{profile});res.json(await readSettings());
}catch(e){next(e)}});
app.get('/api/admin/assistant-settings',async(req,res,next)=>{try{const settings=await readSettings();res.json({assistantName:settings.assistantName||'Florzinha'})}catch(e){next(e)}});
app.put('/api/admin/assistant-settings',async(req,res,next)=>{try{if(!multi)throw new OrderError('Ative o modo de plataforma para personalizar a assistente.',400);const data=z.object({assistantName:z.string().trim().min(2).max(60)}).strict().safeParse(req.body);if(!data.success)throw new OrderError('Informe um nome com 2 a 60 caracteres.',400);await platformStore.saveTenant(tenantId(),{profile:data.data});res.json(data.data);}catch(e){next(e)}});
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
 if(multi)await platformStore.saveTenant(tenantId(),{profile:parsed.data});else if(demo)demoSettings={...demoSettings,...parsed.data};else await pool.request().input('fee',sql.Int,parsed.data.deliveryFee).query('UPDATE dbo.StoreSettings SET deliveryFee=@fee WHERE id=1');
 res.json(await readSettings());
}catch(e){next(e)}});
app.get('/api/admin/contact-orders',async(req,res,next)=>{try{
 const phone=require('./contact').normalizePhone(typeof req.query.phone==='string'?req.query.phone:'');
 const offset=Number(req.query.offset||0);if(!phone||!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new OrderError('Telefone ou página inválida.',400);
 const [result,customer]=await Promise.all([store.byPhone(phone,offset),customers.byPhone(phone)]);res.json({...result,customer:customer?{id:customer.id,name:customer.name,phone:customer.phone}:null,phone});
}catch(e){next(e)}});
app.get('/api/admin/orders/:id',async(req,res,next)=>{try{if(!z.uuid().safeParse(req.params.id).success)throw new OrderError('Pedido inválido.',400);const order=await store.get(req.params.id);if(!order)throw new OrderError('Pedido não encontrado.',404);res.json(order);}catch(e){next(e)}});
app.get('/api/admin/orders',async(req,res,next)=>{try{res.json(await store.list())}catch(e){next(e)}});
app.post('/api/admin/orders',async(req,res,next)=>{try{res.status(201).json(await createOrder(req.body,'manual'))}catch(e){next(e)}});
app.patch('/api/admin/orders/:id',async(req,res,next)=>{try{
 if(!z.uuid().safeParse(req.params.id).success)throw new OrderError('Código de pedido inválido.',400);
 res.json(await store.mutate(req.params.id,req.body));
}catch(e){next(e)}});
app.get('/painel/:slug',async(req,res,next)=>{try{if(!multi)return res.sendStatus(404);const tenant=await platformStore.bySlug(req.params.slug);if(!tenant?.active||tenant.id===require('./tenant-context').PLATFORM_TENANT)return res.status(404).send('Painel indisponível.');res.sendFile(require('node:path').join(__dirname,'public/admin.html'));}catch(e){next(e)}});
app.get('/loja/:slug',async(req,res,next)=>{try{if(!multi)return res.sendStatus(404);const tenant=await platformStore.bySlug(req.params.slug);if(!tenant?.active||tenant.id===require('./tenant-context').PLATFORM_TENANT)return res.status(404).send('Loja indisponível.');res.sendFile(require('node:path').join(__dirname,'public/index.html'));}catch(e){next(e)}});
app.get('/inova',(req,res)=>res.redirect('/inova.html'));
app.use(express.static('public'));
app.use((err,req,res,next)=>{
 if(Number.isInteger(err.status)&&err.status>=400&&err.status<500)return res.status(err.status).json({error:err.message});
 if(err instanceof OrderError)return res.status(err.status).json({error:err.message});
 if(err.type==='entity.parse.failed')return res.status(400).json({error:'JSON inválido.'});
 console.error(err.message);res.status(500).json({error:'Não foi possível concluir. Tente novamente.'});
});
async function start(){
 if(multi&&process.env.NODE_ENV==='production'&&process.env.COOKIE_SECURE!=='true')throw Error('Configure HTTPS e COOKIE_SECURE=true para a plataforma em produção.');
 if(!demo){
  if(process.env.DATA_MODE!=='sqlserver')throw new Error('Defina DATA_MODE=demo ou sqlserver');
  pool=await sql.connect({server:process.env.SQL_HOST,port:Number(process.env.SQL_PORT||1433),database:process.env.SQL_DATABASE,user:process.env.SQL_USER,password:process.env.SQL_PASSWORD,options:{encrypt:true,trustServerCertificate:process.env.SQL_TRUST_CERTIFICATE==='true'}});
  await pool.request().query(require('fs').readFileSync(require('path').join(__dirname,'sql/schema.sql'),'utf8'));
  const check=await pool.request().query("SELECT OBJECT_ID(N'dbo.Customers',N'U') AS customerTable");
  if(!check.recordset[0].customerTable)throw new Error('Cadastro de clientes ainda não instalado. No SSMS, selecione Floricultura e execute sql/customers.sql com uma conta autorizada. Depois inicie novamente.');
 }
 if(multi&&!demo){const check=await pool.request().query("SELECT OBJECT_ID(N'dbo.AppSessions',N'U') AS sessionsTable,COL_LENGTH(N'dbo.Orders',N'tenantId') AS orderTenant,COL_LENGTH(N'dbo.Customers',N'tenantId') AS customerTenant");if(!check.recordset[0].sessionsTable||!check.recordset[0].orderTenant||!check.recordset[0].customerTenant)throw Error('Execute npm run migrate:platform no banco atual com uma conta autorizada antes de iniciar a plataforma.');const company=await pool.request().query("SELECT id FROM dbo.Tenants WHERE id='00000000-0000-4000-8000-000000000002'");if(!company.recordset.length)throw Error('Atualize o esquema da empresa gestora com npm run migrate:platform.');}
 const httpServer=app.listen(process.env.PORT||3000,()=>console.log(`Floricultura iniciada (${demo?'DEMONSTRAÇÃO SEM PERSISTÊNCIA':'SQL Server'})`));
 let shuttingDown=false;
 const shutdown=async()=>{if(shuttingDown)return;shuttingDown=true;const deadline=setTimeout(()=>process.exit(1),15000);httpServer.close();try{await tenantResources.close();await whatsappService.close();await sql.close();clearTimeout(deadline);process.exit(0);}catch{console.error('Não foi possível encerrar o navegador da sessão.');clearTimeout(deadline);process.exit(1);}};
 process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
}
if(require.main===module)start().catch(async e=>{console.error(e.message);try{await sql.close()}catch{}process.exitCode=1});
module.exports=app;
