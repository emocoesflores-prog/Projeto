const fs=require('node:fs/promises'),path=require('node:path');
const {DEFAULT_TENANT}=require('./tenant-context');
function createTenantResources({root=__dirname,makeService=require('./whatsapp-service').createWhatsAppService,getIdentity=async()=>({})}={}){
 const resources=new Map();
 return {
  async get(id){
   if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('Loja inválida');
   if(!resources.has(id))resources.set(id,(async()=>{
    const base=id===DEFAULT_TENANT?root:path.join(root,'.tenants',id);await fs.mkdir(base,{recursive:true,mode:0o700});
    const service=makeService({dataPath:path.join(base,'.wwebjs_auth')});
    const desk=require('./whatsapp-desk-store').createDeskStore(path.join(base,'.whatsapp-desk.json'));
    const ai=require('./florzinha').createFlorzinha({identity:()=>getIdentity(id)});
    return {service,router:require('./whatsapp-routes')(service,desk,ai)};
   })().catch(e=>{resources.delete(id);throw e;}));
   return resources.get(id);
  },
  async stop(id){const pending=resources.get(id);resources.delete(id);if(pending)await (await pending).service.close();},
  async close(){await Promise.allSettled([...resources.keys()].map(id=>this.stop(id)));}
 };
}
module.exports={createTenantResources};
