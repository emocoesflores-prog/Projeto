const {promisify}=require('node:util');
const {scrypt,randomBytes,randomUUID,timingSafeEqual,createHash}=require('node:crypto');
const derive=promisify(scrypt),express=require('express'),{z}=require('zod'),{rateLimit}=require('express-rate-limit');
const {context,DEFAULT_TENANT,PLATFORM_TENANT,PLATFORM_NAME,PLATFORM_LOGIN}=require('./tenant-context');
const hash=value=>createHash('sha256').update(value).digest('hex');
async function hashPassword(password){const salt=randomBytes(16).toString('hex');return 'scrypt$1$'+salt+'$'+(await derive(password,salt,64)).toString('hex');}
async function verifyPassword(password,encoded){const [type,version,salt,digest]=String(encoded||'').split('$');if(type!=='scrypt'||version!=='1'||!/^[a-f0-9]{128}$/.test(digest||''))return false;const candidate=await derive(password,salt,64);return timingSafeEqual(candidate,Buffer.from(digest,'hex'));}
const password=z.string().min(12,'A senha deve ter no mínimo 12 caracteres.').max(128);
const username=z.preprocess(value=>{if(typeof value!=='string')return value;const text=value.trim();if(/^[+().\/\d\s-]+$/.test(text)){const digits=text.replace(/\D/g,'');return digits.length===13&&digits.startsWith('55')?digits.slice(2):digits;}return text.toLowerCase();},z.string().regex(/^[a-z0-9][a-z0-9._@-]{2,79}$/,'Informe um CNPJ ou usuário válido.'));
const profileSchema=z.object({deliveryCities:z.array(z.string().trim().min(2).max(100)).max(30).optional(),assistantName:z.string().trim().min(2).max(60).default('Assistente'),phone:z.string().trim().max(30).default(''),email:z.union([z.email(),z.literal('')]).default(''),document:z.string().trim().max(30).default(''),address:z.string().trim().max(250).default(''),city:z.string().trim().max(100).default(''),state:z.string().trim().max(2).default(''),pickupAddress:z.string().trim().max(300).default(''),deliveryFee:z.number().int().min(0).max(100000).default(2000)}).strict();
const tenantSchema=z.object({name:z.string().trim().min(3).max(120),slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(80),profile:profileSchema,ownerName:z.string().trim().min(3).max(120),username,password}).strict();
function parse(schema,body){const result=schema.safeParse(body);if(!result.success)throw Object.assign(Error(result.error.issues[0]?.message||'Confira os dados.'),{status:400});return result.data;}
function createPlatformAuth(store,{onTenantStopped=async()=>{}}={}){
 const router=express.Router(),secure=process.env.COOKIE_SECURE==='true',cookieName=secure?'__Host-flor-session':'flor-session';
 const cookieOptions={httpOnly:true,secure,sameSite:'strict',path:'/',maxAge:8*60*60*1000};
 const sessionToken=req=>{const item=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='));return item?.slice(cookieName.length+1)||'';};
 const readSession=async req=>{const token=sessionToken(req);return /^[a-f0-9]{64}$/.test(token)?store.session(hash(token)):null;};
 function sameOrigin(req,res,next){const origin=req.headers.origin;if(origin&&origin!==(process.env.APP_ORIGIN||req.protocol+'://'+req.get('host')))return res.status(403).json({error:'Origem não autorizada.'});next();}
 router.use((req,res,next)=>{res.set('Cache-Control','no-store');next()});router.use(sameOrigin);
 const limiter=rateLimit({windowMs:15*60000,limit:20,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Muitas tentativas. Aguarde alguns minutos.'}});
 const publicUser=s=>({id:s.user.id,name:s.user.name,username:s.user.username,role:s.user.role,tenant:{id:s.tenant.id,name:s.tenant.name,slug:s.tenant.slug,profile:s.tenant.profile},csrf:s.csrf});
 router.get('/state',async(req,res,next)=>{try{res.json({setupRequired:!await store.hasUsers(),platformName:PLATFORM_NAME,suggestedUsername:PLATFORM_LOGIN})}catch(e){next(e)}});
 router.post('/bootstrap',limiter,async(req,res,next)=>{try{
  if(await store.hasUsers())throw Object.assign(Error('O administrador principal já foi criado.'),{status:409});
  const data=parse(z.object({setupKey:z.string().min(1).max(256),name:z.string().trim().min(3).max(120),username,password}).strict(),req.body);
  const expected=process.env.ADMIN_TOKEN||'';if(expected.length<16||!timingSafeEqual(Buffer.from(hash(data.setupKey)),Buffer.from(hash(expected))))throw Object.assign(Error('Chave de configuração inválida. Confira ADMIN_TOKEN no servidor.'),{status:401});
  await store.create({bootstrap:true,user:{id:randomUUID(),tenantId:PLATFORM_TENANT,name:data.name,username:data.username,passwordHash:await hashPassword(data.password),role:'master',active:true}});res.status(201).json({ok:true});
 }catch(e){next(e)}});
 const dummy=hashPassword(randomBytes(24).toString('hex'));
 router.post('/login',limiter,async(req,res,next)=>{try{
  const data=parse(z.object({username,password:z.string().min(1).max(128)}).strict(),req.body),user=await store.user(data.username),tenant=user&&await store.tenant(user.tenantId);
  const valid=await verifyPassword(data.password,user?.passwordHash||await dummy);
  if(!valid||!user?.active||!tenant?.active)throw Object.assign(Error('Usuário ou senha inválidos.'),{status:401});
  const token=randomBytes(32).toString('hex'),session={tokenHash:hash(token),userId:user.id,expiresAt:Date.now()+cookieOptions.maxAge,csrf:randomBytes(32).toString('hex')};await store.saveSession(session);res.cookie(cookieName,token,cookieOptions).json(publicUser({...session,user,tenant}));
 }catch(e){next(e)}});
 router.get('/me',async(req,res,next)=>{try{const s=await readSession(req);if(!s)return res.status(401).json({error:'Entre com usuário e senha.'});res.json(publicUser(s));}catch(e){next(e)}});
 router.post('/logout',async(req,res,next)=>{try{const s=await readSession(req);if(s&&req.headers['x-csrf-token']!==s.csrf)return res.status(403).json({error:'Sessão inválida. Atualize a página.'});if(s)await store.deleteSession(s.tokenHash);res.clearCookie(cookieName,{...cookieOptions,maxAge:undefined}).json({ok:true});}catch(e){next(e)}});
 async function authenticate(req,res,next){try{const s=await readSession(req);if(!s)return res.status(401).json({error:'Sua sessão expirou. Entre com usuário e senha.'});if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers['x-csrf-token']!==s.csrf)return res.status(403).json({error:'Sessão inválida. Atualize a página.'});req.account=s;req.validateSession=()=>readSession(req);context.run(require('./tenant-context').policy(s.tenant),next);}catch(e){next(e)}}
 const platform=express.Router();platform.use(authenticate,(req,res,next)=>req.account.user.role==='master'?next():res.status(403).json({error:'Apenas o administrador principal pode gerenciar floriculturas.'}));
 platform.get('/tenants',async(req,res,next)=>{try{res.json(await store.tenants())}catch(e){next(e)}});
 platform.post('/tenants',async(req,res,next)=>{try{const data=parse(tenantSchema,req.body),tenant=store.newTenant(data);await store.create({tenant,user:{id:randomUUID(),tenantId:tenant.id,username:data.username,name:data.ownerName,passwordHash:await hashPassword(data.password),role:'owner',active:true}});res.status(201).json(tenant);}catch(e){next(e)}});
 platform.patch('/tenants/:id',async(req,res,next)=>{try{if(!z.uuid().safeParse(req.params.id).success)throw Object.assign(Error('Loja inválida.'),{status:400});const patch=parse(z.object({name:z.string().trim().min(3).max(120).optional(),active:z.boolean().optional(),profile:profileSchema.optional()}).strict(),req.body);if(req.params.id===PLATFORM_TENANT)throw Object.assign(Error('O cadastro da empresa gestora é protegido.'),{status:400});const tenant=await store.saveTenant(req.params.id,patch);if(!tenant)throw Object.assign(Error('Loja não encontrada.'),{status:404});if(patch.active===false)await onTenantStopped(tenant.id);res.json(tenant);}catch(e){next(e)}});
 platform.post('/tenants/:id/access',async(req,res,next)=>{try{const data=parse(z.object({name:z.string().trim().min(3).max(120),username,password}).strict(),req.body);if(!z.uuid().safeParse(req.params.id).success||req.params.id===PLATFORM_TENANT||!await store.tenant(req.params.id))throw Object.assign(Error('Loja inválida.'),{status:400});await store.create({user:{id:randomUUID(),tenantId:req.params.id,name:data.name,username:data.username,passwordHash:await hashPassword(data.password),role:'owner',active:true}});res.status(201).json({ok:true});}catch(e){next(e)}});
 platform.post('/tenants/:id/password',async(req,res,next)=>{try{const data=parse(z.object({password}).strict(),req.body);if(!z.uuid().safeParse(req.params.id).success||!await store.tenant(req.params.id)||req.params.id===PLATFORM_TENANT)throw Object.assign(Error('Loja inválida.'),{status:400});await store.resetOwner(req.params.id,await hashPassword(data.password));await onTenantStopped(req.params.id);res.json({ok:true});}catch(e){next(e)}});
 return {router,platform,authenticate,readSession,sameOrigin};
}
module.exports={createPlatformAuth,hashPassword,verifyPassword,profileSchema};
