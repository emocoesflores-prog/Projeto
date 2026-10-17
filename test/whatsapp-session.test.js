const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');
const {SafeLocalAuth,guardPageCallbacks}=require('../whatsapp-local-auth');
const {createWhatsAppService}=require('../whatsapp-service');
test('Logout defers profile removal until Chrome closes and retains locked cleanup for retry',async()=>{
 let alive=true,locked=true;const removed=[],warnings=[];
 const auth=new SafeLocalAuth({dataPath:'/tmp/session-unit',onWarning:c=>warnings.push(c),fileSystem:{mkdir:async()=>{},writeFile:async()=>{},rename:async()=>{},access:async()=>{},rm:async(p)=>{assert.equal(alive,false);if(locked)throw Object.assign(Error('locked'),{code:'EBUSY'});removed.push(p);}}});
 auth.client={pupBrowser:{isConnected:()=>alive}};
 await auth.logout();assert.equal(removed.length,0);assert.equal(await auth.cleanup(),false);
 alive=false;assert.equal(await auth.cleanup(),false);assert.equal(auth.cleanupRequested,true);assert.equal(warnings.at(-1),'WA_SESSION_CLEANUP_PENDING');
 locked=false;assert.equal(await auth.cleanup(),true);assert.equal(removed.length,2);assert.equal(auth.cleanupRequested,false);
});
test('Owned page async callbacks do not cause unhandled rejections and can be removed',async()=>{
 const page=new EventEmitter(),warnings=[];guardPageCallbacks(page,c=>warnings.push(c));const listener=async()=>{throw Error('private')};page.on('framenavigated',listener);page.emit('framenavigated');await new Promise(setImmediate);assert.deepEqual(warnings,['WA_PAGE_CALLBACK_FAILED']);page.off('framenavigated',listener);assert.equal(page.listenerCount('framenavigated'),0);
});
test('Disconnect bounds a hanging logout, closes Chrome before cleanup, and blocks duplicate operations',async()=>{
 const client=new EventEmitter(),steps=[];let alive=true;
 client.initialize=async()=>{};client.pupBrowser={isConnected:()=>alive};client.logout=()=>new Promise(()=>{});client.destroy=async()=>{steps.push('close');alive=false};client.authStrategy={cleanup:async()=>{assert.equal(alive,false);steps.push('cleanup');return true}};
 const service=createWhatsAppService({clientFactory:()=>client,shutdownTimeoutMs:10});await service.connect();client.emit('ready');const first=service.disconnect();assert.equal(service.status().canConnect,false);assert.equal(service.status().canDisconnect,false);await Promise.all([first,service.disconnect(),service.connect()]);assert.deepEqual(steps,['close','cleanup']);assert.equal(service.status().status,'disconnected');assert.match(service.status().error,/Confira em Aparelhos/);
});
test('Stopping server preserves authenticated session without logout',async()=>{const client=new EventEmitter();let destroyed=0;client.initialize=async()=>{};client.destroy=async()=>destroyed++;client.logout=async()=>assert.fail('must preserve session');const service=createWhatsAppService({clientFactory:()=>client});await service.connect();client.emit('ready');await service.close();assert.equal(destroyed,1);});
test('A browser that cannot close reports failure and prevents another connection',async()=>{const client=new EventEmitter();let factories=0;client.initialize=async()=>{};client.logout=async()=>{};client.destroy=()=>new Promise(()=>{});client.pupBrowser={isConnected:()=>true};const service=createWhatsAppService({clientFactory:()=>{factories++;return client},shutdownTimeoutMs:10});await service.connect();client.emit('ready');await assert.rejects(service.disconnect(),/ainda não encerrou/);assert.equal(service.status().canConnect,false);await service.connect();assert.equal(factories,1);});
test('Logout pelo celular libera navegador e permite nova sessão com QR sem reiniciar servidor',async()=>{
 const clients=[],steps=[];let finishClose;
 const service=createWhatsAppService({qrEncoder:async()=> 'data:image/png;base64,new',clientFactory:()=>{
  const c=new EventEmitter();let alive=true;c.initialize=async()=>{};c.pupBrowser={isConnected:()=>alive};c.authStrategy={logout:async()=>steps.push('mark'),cleanup:async()=>{assert.equal(alive,false);steps.push('clean');return true}};
  c.destroy=async()=>{await new Promise(r=>finishClose=r);alive=false;steps.push('close')};clients.push(c);return c;
 }});
 await service.connect();clients[0].emit('ready');clients[0].emit('disconnected','LOGOUT');clients[0].emit('disconnected','LOGOUT');
 assert.equal(service.status().status,'disconnecting');assert.equal(service.status().canConnect,false);await service.connect();assert.equal(clients.length,1);
 await new Promise(setImmediate);finishClose();await new Promise(setImmediate);
 assert.deepEqual(steps,['mark','close','clean']);assert.equal(service.status().canConnect,true);assert.equal(service.status().canDisconnect,false);
 await service.connect();assert.equal(clients.length,2);clients[0].emit('ready');assert.equal(service.status().status,'starting');clients[1].emit('qr','new-secret');await new Promise(setImmediate);assert.equal(service.status().status,'qr');assert.match(service.status().qr,/new/);
});
test('Falha ao fechar após logout remoto informa erro e permite tentar desconectar novamente',async()=>{
 const c=new EventEmitter();let fails=true;c.initialize=async()=>{};c.pupBrowser={isConnected:()=>fails};c.authStrategy={logout:async()=>{},cleanup:async()=>true};c.destroy=async()=>{if(fails)throw Error('locked')};c.logout=async()=>{};
 const service=createWhatsAppService({clientFactory:()=>c});await service.connect();c.emit('ready');c.emit('disconnected');await new Promise(setImmediate);
 assert.equal(service.status().status,'error');assert.equal(service.status().canDisconnect,true);assert.equal(service.status().canConnect,false);
 fails=false;await service.disconnect();assert.equal(service.status().canConnect,true);
});
test('Arquivos bloqueados não impedem perfil novo e callbacks antigos não alteram sua sessão',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'wa-profile-'));
 try{
  const old=new SafeLocalAuth({dataPath:dir,fileSystem:{...fs,rm:async()=>{throw Object.assign(Error('locked'),{code:'EBUSY'})}}});
  old.setup({options:{puppeteer:{}},pupBrowser:{isConnected:()=>false}});await old.beforeBrowserInitialized();const previous=old.userDataDir;
  await Promise.all([old.logout(),old.logout()]);const next=new SafeLocalAuth({dataPath:dir});next.setup({options:{puppeteer:{}}});await next.beforeBrowserInitialized();assert.notEqual(next.userDataDir,previous);
  assert.equal(await old.cleanup(),false);const pointer=await fs.readFile(path.join(dir,'.active-profile'),'utf8');await old.beforeBrowserInitialized();await old.logout();assert.equal(await fs.readFile(path.join(dir,'.active-profile'),'utf8'),pointer);
  const restart=new SafeLocalAuth({dataPath:dir});restart.setup({options:{puppeteer:{}}});await restart.beforeBrowserInitialized();assert.equal(restart.userDataDir,next.userDataDir);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Limpeza lenta não segura estado desconectado, botão de conectar ou notificações',async()=>{
 const client=new EventEmitter();let alive=true,finishCleanup;client.initialize=async()=>{};client.pupBrowser={isConnected:()=>alive};client.logout=async()=>{};client.destroy=async()=>{alive=false};client.authStrategy={logout:async()=>{},cleanup:()=>new Promise(r=>finishCleanup=r)};
 const service=createWhatsAppService({clientFactory:()=>client}),states=[];const unsubscribe=service.subscribe(s=>states.push(s));await service.connect();client.emit('ready');client.emit('change_state','UNPAIRED');await new Promise(setImmediate);
 assert.equal(service.status().canConnect,true);assert.equal(service.status().status,'disconnected');assert.equal(states.at(-1).canConnect,true);assert.ok(states.some(s=>s.status==='disconnecting'));finishCleanup(true);unsubscribe();
});
test('Eventos de estado exigem autenticação e entregam logout em stream sem aguardar consulta periódica',async()=>{
 const express=require('express'),routes=require('../whatsapp-routes');const client=new EventEmitter();let alive=true;client.initialize=async()=>{};client.destroy=async()=>{alive=false};client.pupBrowser={isConnected:()=>alive};client.authStrategy={logout:async()=>{},cleanup:async()=>true};
 const service=createWhatsAppService({clientFactory:()=>client});await service.connect();client.emit('ready');
 const app=express();app.use('/wa',(req,res,next)=>req.headers.authorization==='Bearer fake'?next():res.sendStatus(401),routes(service,{}, {configured:()=>false}));const server=app.listen(0);await new Promise(r=>server.once('listening',r));const controller=new AbortController();
 try{const url='http://127.0.0.1:'+server.address().port+'/wa/events';assert.equal((await fetch(url)).status,401);const res=await fetch(url,{headers:{Authorization:'Bearer fake'},signal:controller.signal});assert.match(res.headers.get('content-type'),/text\/event-stream/);const reader=res.body.getReader(),decoder=new TextDecoder();assert.match(decoder.decode((await reader.read()).value),/"status":"ready"/);
 client.emit('disconnected','LOGOUT');let data='';const deadline=AbortSignal.timeout(1000);while(!data.includes('"canConnect":true')){const chunk=await Promise.race([reader.read(),new Promise((_,reject)=>deadline.addEventListener('abort',()=>reject(Error('No live event')),{once:true}))]);data+=decoder.decode(chunk.value);}assert.match(data,/"status":"disconnected"/);assert.doesNotMatch(data,/Bearer|fake/);
 }finally{controller.abort();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('UNPAIRED ao aguardar QR e perda temporária de rede não invalidam a sessão',async()=>{
 const c=new EventEmitter();let closes=0;c.initialize=async()=>{};c.destroy=async()=>{closes++};const service=createWhatsAppService({clientFactory:()=>c,qrEncoder:async()=> 'data:image/png;base64,qr'});await service.connect();c.emit('change_state','UNPAIRED');c.emit('qr','fresh');await new Promise(setImmediate);assert.equal(service.status().status,'qr');assert.equal(closes,0);c.emit('ready');c.emit('change_state','TIMEOUT');await new Promise(setImmediate);assert.equal(service.status().status,'ready');assert.equal(closes,0);await service.close();
});
test('Desconectar pelo painel solicita logout remoto e publica o estado final sem aguardar limpeza',async()=>{
 const c=new EventEmitter(),events=[];let alive=true,requested=false,finishCleanup;c.initialize=async()=>{};c.pupBrowser={isConnected:()=>alive};c.logout=async()=>{requested=true;c.emit('disconnected','LOGOUT')};c.destroy=async()=>{alive=false};c.authStrategy={logout:async()=>{},cleanup:()=>new Promise(r=>finishCleanup=r)};const service=createWhatsAppService({clientFactory:()=>c});service.subscribe(s=>events.push(s));await service.connect();c.emit('ready');await service.disconnect();assert.equal(requested,true);assert.equal(events.at(-1).canConnect,true);assert.equal(events.at(-1).status,'disconnected');finishCleanup(true);
});
