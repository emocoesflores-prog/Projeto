const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {LocalAuth}=require('whatsapp-web.js');
// Puppeteer's async event callbacks are not awaited by its event emitter.
// Catch failures on this client's page; never install a global rejection handler.
function guardPageCallbacks(page,onWarning){
 if(!page||page.__floriculturaGuarded)return;
 const on=page.on.bind(page),off=page.off?.bind(page),wrappers=new WeakMap();
 page.on=function(event,listener){
  if(typeof listener!=='function')return on(event,listener);
  let wrapped=wrappers.get(listener);
  if(!wrapped){wrapped=(...args)=>{try{const result=listener(...args);if(result?.then)result.catch(()=>onWarning('WA_PAGE_CALLBACK_FAILED'));}catch{onWarning('WA_PAGE_CALLBACK_FAILED');}};wrappers.set(listener,wrapped);}
  return on(event,wrapped);
 };
 if(off)page.off=function(event,listener){return off(event,wrappers.get(listener)||listener)};
 page.__floriculturaGuarded=true;
}
class SafeLocalAuth extends LocalAuth{
 constructor({fileSystem=fs,onWarning=()=>{},...options}={}){super(options);this.files=fileSystem;this.onWarning=onWarning;this.rootDataPath=this.dataPath;this.pendingFile=path.join(this.dataPath,'.logout-pending');this.cleanupRequested=false;this.retirement=null;this.loaded=false;}
 async pending(){if(this.cleanupRequested)return true;try{await this.files.access(this.pendingFile);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
 async logout(){
  if(this.retirement)return this.retirement;
  this.cleanupRequested=true;
  this.retirement=(async()=>{
   await this.files.mkdir(this.rootDataPath,{recursive:true});
   const next='profile-'+randomUUID(),pointer=path.join(this.rootDataPath,'.active-profile');
   const temp=pointer+'.'+randomUUID()+'.tmp';
   await this.files.writeFile(temp,next,{mode:0o600});await this.files.rename(temp,pointer);
   try{await this.files.writeFile(this.pendingFile,'pending\n',{mode:0o600});}catch{}
  })();
  // Fail explicitly if the new profile cannot be registered; never silently reuse a revoked profile.
  return this.retirement;
 }
 async cleanup(){
  if(!await this.pending())return true;
  if(this.client?.pupBrowser?.isConnected?.())return false;
  try{
   await this.files.rm(this.userDataDir||path.join(this.dataPath,this.clientId?'session-'+this.clientId:'session'),{recursive:true,force:true,maxRetries:0});
   await this.files.rm(this.pendingFile,{force:true});this.cleanupRequested=false;return true;
  }catch(e){if(['EBUSY','EPERM','EACCES','ENOTEMPTY'].includes(e.code)){this.onWarning('WA_SESSION_CLEANUP_PENDING');return false;}throw e;}
 }
 async beforeBrowserInitialized(){
  // The SDK calls this hook again from its old logout navigation callback.
  if(this.retirement)return;
  if(!this.loaded){
   let active;try{active=(await this.files.readFile(path.join(this.rootDataPath,'.active-profile'),'utf8')).trim();}catch(e){if(e.code!=='ENOENT')throw e;}
   if(active){if(!/^profile-[a-f0-9-]{36}$/.test(active))throw Error('WA_INVALID_PROFILE');this.dataPath=path.join(this.rootDataPath,active);this.pendingFile=path.join(this.dataPath,'.logout-pending');}
   this.loaded=true;
  }
  // Migrate an interrupted logout from older releases to a fresh profile.
  if(await this.pending()){
   await this.logout();const replacement=new SafeLocalAuth({dataPath:this.rootDataPath,fileSystem:this.files,onWarning:this.onWarning});replacement.setup(this.client);await replacement.beforeBrowserInitialized();this.client.authStrategy=replacement;return;
  }
  await super.beforeBrowserInitialized();
 }
 async afterBrowserInitialized(){guardPageCallbacks(this.client.pupPage,code=>{if(!this.retirement)this.onWarning(code);});}
}
module.exports={SafeLocalAuth,guardPageCallbacks};
