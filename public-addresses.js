const fs=require('node:fs/promises'),path=require('node:path');
const reserved=new Set(['api','painel','loja','inova','entregador','acompanhar','produto','media','public']);
function platform(){const value=process.env.PLATFORM_PUBLIC_URL||'https://inovafacil.com.br';const url=new URL(value);if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw Error('PLATFORM_PUBLIC_URL deve usar HTTPS.');return url.origin;}
function hostname(tenant){const domain=require('./tenant-configuration').state(tenant).domain;return domain.hostname&&domain.verifiedAt?domain.hostname:'';}
function base(tenant){const host=hostname(tenant);return host?'https://'+host:platform()+'/'+encodeURIComponent(tenant.slug);}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inject(html,tenant,basePath){return html.replace('</head>','<meta name="store-slug" content="'+escape(tenant.slug)+'"><meta name="store-base" content="'+escape(basePath)+'"></head>');}
function create({platformStore,multi}){const cache=new Map();
 async function domain(req,res,next){try{if(!multi)return next();const host=req.hostname.toLowerCase();if(['localhost','127.0.0.1','::1','[::1]',new URL(platform()).hostname].includes(host))return next();let entry=cache.get(host);if(!entry||entry.until<Date.now()){const tenant=await platformStore.byDomain(host);entry={tenant,until:Date.now()+30000};if(cache.size>1000)cache.clear();cache.set(host,entry);}if(entry.tenant?.active)req.publicTenant=entry.tenant;next();}catch(error){next(error);}}
 async function render(req,res,next,tenant,basePath){try{if(!tenant?.active||tenant.id===require('./tenant-context').PLATFORM_TENANT)return next();if(req.publicTenant&&tenant.id!==req.publicTenant.id)return res.sendStatus(404);const html=await fs.readFile(path.join(__dirname,'public/index.html'),'utf8');res.set('Cache-Control','no-store').send(inject(html,tenant,basePath));}catch(error){next(error);}}
 function register(app){app.get('/',(req,res,next)=>req.publicTenant?render(req,res,next,req.publicTenant,''):next());app.get('/:slug',(req,res,next)=>{if(!multi||reserved.has(req.params.slug)||!/^[-a-z0-9]{3,80}$/.test(req.params.slug))return next();platformStore.bySlug(req.params.slug).then(t=>render(req,res,next,t,'/'+req.params.slug)).catch(next);});}
 return {domain,register,clear:()=>cache.clear()};
}
module.exports={base,hostname,platform,inject,create};
