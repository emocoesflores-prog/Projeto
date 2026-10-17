const fs=require('node:fs/promises');
const path=require('node:path');
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
 constructor({fileSystem=fs,onWarning=()=>{},...options}={}){super(options);this.files=fileSystem;this.onWarning=onWarning;this.pendingFile=path.join(this.dataPath,'.logout-pending');this.cleanupRequested=false;}
 async pending(){if(this.cleanupRequested)return true;try{await this.files.access(this.pendingFile);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
 async logout(){
  // The browser may still hold the profile. Defer deletion until it has closed.
  this.cleanupRequested=true;
  try{await this.files.mkdir(this.dataPath,{recursive:true});await this.files.writeFile(this.pendingFile,'pending\n',{mode:0o600});}
  catch{this.onWarning('WA_SESSION_CLEANUP_PENDING');}
 }
 async cleanup(){
  if(!await this.pending())return true;
  if(this.client?.pupBrowser?.isConnected?.())return false;
  try{
   await this.files.rm(this.userDataDir||path.join(this.dataPath,this.clientId?'session-'+this.clientId:'session'),{recursive:true,force:true,maxRetries:8,retryDelay:200});
   await this.files.rm(this.pendingFile,{force:true});this.cleanupRequested=false;return true;
  }catch(e){if(['EBUSY','EPERM','EACCES','ENOTEMPTY'].includes(e.code)){this.onWarning('WA_SESSION_CLEANUP_PENDING');return false;}throw e;}
 }
 async beforeBrowserInitialized(){
  if(!await this.cleanup())throw Object.assign(new Error('O Chrome da sessão ainda está encerrando. Feche apenas a janela de WhatsApp aberta pelo sistema e tente novamente.'),{code:'WA_SESSION_LOCKED'});
  await super.beforeBrowserInitialized();
 }
 async afterBrowserInitialized(){guardPageCallbacks(this.client.pupPage,this.onWarning);}
}
module.exports={SafeLocalAuth,guardPageCallbacks};
