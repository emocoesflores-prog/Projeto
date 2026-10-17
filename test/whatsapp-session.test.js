const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');
const {SafeLocalAuth,guardPageCallbacks}=require('../whatsapp-local-auth');
const {createWhatsAppService}=require('../whatsapp-service');
test('Logout defers profile removal until Chrome closes and retains locked cleanup for retry',async()=>{
 let alive=true,locked=true;const removed=[],warnings=[];
 const auth=new SafeLocalAuth({dataPath:'/tmp/session-unit',onWarning:c=>warnings.push(c),fileSystem:{mkdir:async()=>{},writeFile:async()=>{},access:async()=>{},rm:async(p)=>{assert.equal(alive,false);if(locked)throw Object.assign(Error('locked'),{code:'EBUSY'});removed.push(p);}}});
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
