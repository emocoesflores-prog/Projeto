const fs=require('node:fs/promises'),path=require('node:path');
const {createCipheriv,createDecipheriv,randomBytes}=require('node:crypto');
const providers=['facebook','instagram','gmail','outlook','imap'];
function createVault({root=path.join(__dirname,'.tenants'),key=process.env.CHANNELS_ENCRYPTION_KEY}={}){
 const bytes=typeof key==='string'?Buffer.from(key,'base64'):Buffer.alloc(0),locks=new Map();
 const configured=()=>bytes.length===32;
 function location(tenant,provider){if(!/^[0-9a-f-]{36}$/i.test(tenant)||!providers.includes(provider))throw Error('Canal inválido.');return path.join(root,tenant,'channels',provider+'.enc');}
 function requireKey(){if(!configured())throw Object.assign(Error('Configure CHANNELS_ENCRYPTION_KEY no servidor para proteger as conexões.'),{status:503});}
 async function read(tenant,provider){requireKey();try{const blob=JSON.parse(await fs.readFile(location(tenant,provider),'utf8')),dec=createDecipheriv('aes-256-gcm',bytes,Buffer.from(blob.iv,'base64'));dec.setAAD(Buffer.from(tenant+':'+provider));dec.setAuthTag(Buffer.from(blob.tag,'base64'));return JSON.parse(Buffer.concat([dec.update(Buffer.from(blob.data,'base64')),dec.final()]).toString('utf8'));}catch(e){if(e.code==='ENOENT')return null;throw Object.assign(Error('Não foi possível ler a conexão protegida. Confira a chave do servidor.'),{status:503});}}
 async function update(tenant,provider,fn){requireKey();const file=location(tenant,provider),prior=locks.get(file)||Promise.resolve();const task=prior.catch(()=>{}).then(async()=>{const current=await read(tenant,provider),next=await fn(current);if(next===null){await fs.rm(file,{force:true});return null;}const iv=randomBytes(12),enc=createCipheriv('aes-256-gcm',bytes,iv);enc.setAAD(Buffer.from(tenant+':'+provider));const data=Buffer.concat([enc.update(JSON.stringify(next)),enc.final()]);await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});const tmp=file+'.'+randomBytes(6).toString('hex')+'.tmp';try{await fs.writeFile(tmp,JSON.stringify({iv:iv.toString('base64'),tag:enc.getAuthTag().toString('base64'),data:data.toString('base64')}),{mode:0o600});await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true});}return next;});locks.set(file,task);try{return await task;}finally{if(locks.get(file)===task)locks.delete(file);}}
 return {configured,read,update};
}
module.exports={createVault,providers};
