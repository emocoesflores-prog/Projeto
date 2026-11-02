/* Verificação opcional em Chromium, com banco temporário e canais simulados.
   Não usa contas reais nem envia mensagens para fora do processo. */
const {createRequire}=require('node:module');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const requireProject=createRequire(path.join(__dirname,'../package.json'));
const puppeteer=createRequire(requireProject.resolve('whatsapp-web.js'))('puppeteer');
const sharp=requireProject('sharp');
process.env.DATA_MODE='demo';process.env.AUTH_MODE='multi';process.env.ADMIN_TOKEN='reference-review-fixture';
process.env.DRIVER_ACCESS_KEY=Buffer.alloc(32,8).toString('base64');process.env.ORS_API_KEY='';

async function main(){
 const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'reference-review-'));
 const output=process.env.REVIEW_OUTPUT_DIR||path.join(os.tmpdir(),'projeto-reference-review');await fs.mkdir(output,{recursive:true});
 const chatA='5511988887777@c.us',chatB='5511977776666@c.us';
 const chats=[{id:chatA,name:'Juliana Martins',unread:1,timestamp:Date.now()/1000,preview:'Vocês conseguem entregar hoje?'},{id:chatB,name:'Camila Oliveira',unread:1,timestamp:Date.now()/1000-100,preview:'Qual é o prazo de entrega?'}];
 const messages=new Map(chats.map(chat=>[chat.id,[{id:randomUUID(),body:'Olá! Gostaria de um buquê para aniversário.',timestamp:chat.timestamp-120,fromMe:false},{id:randomUUID(),body:chat.preview,timestamp:chat.timestamp,fromMe:false}]]));
 const sent=[],media=[];let delaySend=null;
 const makeService=()=>({
  status:()=>({status:'ready'}),refreshStatus:async()=>({status:'ready'}),subscribe:()=>()=>{},close:async()=>{},connect:async()=>{},disconnect:async()=>{},
  chats:async()=>chats,messages:async id=>messages.get(id)||[],contactPhone:async id=>id.split('@')[0],
  resolve:async phone=>({id:phone.replace(/\D/g,'').replace(/^(?!55)/,'55')+'@c.us',name:phone}),
  async send(id,body){if(delaySend)await delaySend;const message={id:randomUUID(),body,timestamp:Date.now()/1000,fromMe:true,ack:3};sent.push({id,body});messages.set(id,[...(messages.get(id)||[]),message]);return message;},
  async sendMedia(id,buffer,mimetype,filename){media.push({id,mimetype,filename});return {id:randomUUID()};}
 });
 requireProject('./whatsapp-service').createWhatsAppService=makeService;
 const resources=requireProject('./tenant-resources'),originalResources=resources.createTenantResources;
 resources.createTenantResources=options=>originalResources({...options,root:scratch,makeService});
 const channels=requireProject('./channel-routes'),originalChannels=channels.createChannels;
 channels.createChannels=()=>originalChannels({
  vault:{configured:()=>true,read:async(id,provider)=>['instagram','facebook','gmail'].includes(provider)?{label:'Conta de teste '+provider}:null},
  adapters:{chats:async(id,provider)=>[{id:'fixture-'+provider,name:provider==='instagram'?'Pedro Santos':'Cliente '+provider,timestamp:Date.now()/1000-200,unread:1,preview:'Gostaria de informações.'}],messages:async()=>[{id:'external-message',body:'Olá! Gostaria de informações.',timestamp:Date.now()/1000,fromMe:false}],send:async()=>({id:randomUUID()})}
 });
 const app=requireProject('./server'),server=app.listen(0),base='http://127.0.0.1:'+server.address().port;
 let browser,page;const errors=[];let quoteRequests=0;
 async function api(route,body,session,method=body===undefined?'GET':'POST'){
  const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}),data=await response.json();
  assert.ok(response.status<300,route+': '+JSON.stringify(data));return {data,cookie:response.headers.get('set-cookie')?.split(';')[0]};
 }
 async function clickText(selector,text){
  const key='review-'+randomUUID();await page.evaluate(({selector,text,key})=>{const button=[...document.querySelectorAll(selector)].find(e=>e.textContent.trim().replace(/^[^\p{L}\p{N}]+/u,'')===text||e.dataset.systemLabel===text);if(!button)throw Error('Botão ausente: '+text);button.dataset.reviewClick=key;},{selector,text,key});await page.click('[data-review-click="'+key+'"]');
 }
 async function fill(selector,value){await page.$eval(selector,(element,value)=>{element.value=value;element.dispatchEvent(new Event('input',{bubbles:true}));},value);}
 async function choose(id){await page.evaluate(id=>document.querySelector('[data-chat-id="'+id+'"]').click(),id);await page.waitForFunction(id=>document.querySelector('.inbox-row[aria-pressed=true]')?.dataset.chatId===id,{},id);await page.waitForSelector('.inbox-bubble');}
 async function assume(){if(await page.$('.inbox-chat-head .button')){const present=await page.evaluate(()=>[...document.querySelectorAll('.inbox-chat-head button')].some(b=>b.textContent.trim()==='Assumir'));if(present)await clickText('.inbox-chat-head button','Assumir');}await page.waitForFunction(()=>!document.querySelector('.inbox-message-input').disabled);}
 try{
  await api('/api/auth/bootstrap',{setupKey:process.env.ADMIN_TOKEN,name:'Gestor',username:'gestor-referencia',password:'senha-gestor-referencia'});
  const management=await api('/api/auth/management/login',{username:'gestor-referencia',password:'senha-gestor-referencia'}),master={cookie:management.cookie,csrf:management.data.csrf};
  await api('/api/platform/tenants',{name:'Floricultura Jardim de Emoções',slug:'jardim-referencia',ownerName:'Ana',username:'jardim-referencia',password:'senha-loja-referencia',profile:{deliveryCities:['Mauá'],city:'Mauá',state:'SP',deliveryFee:0,assistantName:'Florzinha'}},master);
  const login=await api('/api/auth/login',{username:'jardim-referencia',password:'senha-loja-referencia'}),owner={cookie:login.cookie,csrf:login.data.csrf};
  const operations=async()=>(await api('/api/admin/operations',undefined,owner)).data;
  const change=async(action,data)=>(await api('/api/admin/operations',{action,version:(await operations()).state.revision,data},owner)).data;
  await change('payments.save',{methods:[{id:'pix',name:'PIX',active:true,instructions:''},{id:'credit_card',name:'Cartão de crédito',active:true,instructions:''},{id:'cash',name:'Dinheiro',active:true,instructions:''}]});
  const attendant=(await api('/api/admin/team',{name:'Bruno',username:'bruno-referencia',password:'senha-bruno-referencia',active:true},owner)).data;
  const customer=(await api('/api/admin/customers',{name:'Juliana Martins',phone:'11988887777',email:'juliana@example.com'},owner)).data;
  async function order(working){
   let value=(await api('/api/admin/orders',{customerId:customer.id,recipient:customer.name,fulfillment:'pickup',scheduleMode:'now',paymentMethod:'pix',items:[{id:1,quantity:working?1:2}],message:'Feliz aniversário! Que seu dia seja especial.'},owner)).data;
   value=(await api('/api/admin/orders/'+value.id,{action:'settlement',version:value.version,operationId:randomUUID(),confirmed:true,entries:[{id:randomUUID(),method:'pix',tendered:working?value.total:5000,reference:'Conferido em teste'}]},owner,'PATCH')).data;
   if(working)value=(await change('workshop.start',{orderId:value.id,orderVersion:value.version})).orders[0];return value;
  }
  const queued=await order(false);await order(true);
  const photo=path.join(scratch,'anexo.png');await sharp({create:{width:12,height:12,channels:3,background:'#e8004c'}}).png().toFile(photo);
  let executablePath=process.env.CHROME_PATH;for(const candidate of ['/usr/bin/chromium','/usr/bin/chromium-browser','C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe']){if(executablePath)break;try{await fs.access(candidate);executablePath=candidate;}catch{}}
  browser=await puppeteer.launch({...(executablePath?{executablePath}:{}),headless:true,args:['--no-sandbox','--lang=pt-BR'],env:{...process.env,XDG_CONFIG_HOME:path.join(scratch,'chrome-config'),XDG_CACHE_HOME:path.join(scratch,'chrome-cache')}});
  page=await browser.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.stack));page.on('dialog',dialog=>dialog.accept());
  page.on('request',request=>{if(request.url().endsWith('/api/admin/checkout/quote')&&request.method()==='POST')quoteRequests++;});
  await page.setViewport({width:1674,height:940});await page.goto(base+'/painel/jardim-referencia#workshop');await page.type('#username','jardim-referencia');await page.type('#password','senha-loja-referencia');await page.click('#login button');await page.waitForSelector('.kds-working .kds-ticket');await page.evaluate(()=>AdminTheme.apply('light'));
  console.log('ODP: configuração direta, fila compacta, parcial, ações e tela de produção.');
  await clickText('.kds-actions button','Configurar ODP');await page.waitForSelector('.configuration-dialog[open] [name=preparationLeadMinutes]');
  assert.equal(await page.$eval('#view-workshop',element=>element.hidden),false);await clickText('.configuration-dialog button','Fechar');
  assert.ok(await page.$('.kds-queue-compact .payment-partial'));assert.ok(await page.$('.kds-queue-compact .kds-ticket-footer .button'));
  await page.click('.kds-queue-more');await page.waitForSelector('.kds-queue-menu[open]');await clickText('.kds-queue-menu button','Ver itens, cartão e instruções');await page.waitForFunction(()=>document.querySelector('.kds-queue .kds-notes').open);
  await page.$eval('.kds-queue .kds-notes',element=>element.open=false);await clickText('.kds-actions button','Tela de produção');await page.waitForSelector('.kds-screen-mode');assert.equal(await page.$eval('.kds-screen-mode',element=>Math.round(element.getBoundingClientRect().height)===innerHeight),true);await clickText('.kds-actions button','Sair da tela de produção');await page.waitForFunction(()=>!document.querySelector('.kds-screen-mode'));
  await page.screenshot({path:path.join(output,'odp.png'),fullPage:true});
  console.log('PDV: motivo obrigatório, preço só na venda, PIX/cartão/dinheiro na próxima tela e troco sem nova cotação.');
  for(const method of ['pix','credit_card','cash']){
   await page.evaluate(()=>FloristPOS.open({newSale:true}));await page.waitForSelector('#pdv[open] .pdv-add');await page.click('.pdv-add');
   if(method==='cash'){
    await page.click('.pdv-edit-price');await page.waitForSelector('.sale-price-dialog[open]');await fill('.sale-price-dialog input','139,00');await page.click('.sale-price-dialog button[type=submit]');assert.ok(await page.$('.sale-price-dialog[open]'));
    await fill('.sale-price-dialog textarea','Acordo comercial exclusivo desta venda');await page.click('.sale-price-dialog button[type=submit]');
   }
   await page.waitForFunction(()=>!document.querySelector('#pdv-submit').disabled);await page.select('#pdv-form [name=paymentMethod]',method);
   if(method==='cash'){
    const before=quoteRequests;await fill('#pdv-form [name=cashTendered]','150,00');await page.waitForFunction(()=>document.querySelector('.pdv-cash-change').textContent.includes('11,00'));
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));assert.equal(quoteRequests,before,'Digitar dinheiro não deve recalcular o orçamento no servidor.');
    await fill('#pdv-form [name=cashTendered]','50,00');assert.match(await page.$eval('.pdv-cash-change',element=>element.textContent),/89,00/);
    await fill('#pdv-form [name=cashTendered]','150,00');await page.$eval('.pdv-sale-scroll',element=>element.scrollTop=element.scrollHeight);await page.screenshot({path:path.join(output,'pdv-dinheiro.png'),fullPage:true});
   }
   const created=page.waitForResponse(response=>response.url().endsWith('/api/admin/orders')&&response.request().method()==='POST');await page.click('#pdv-submit');const sale=await (await created).json();
   assert.equal(sale.paymentStatus,'pending');assert.equal(sale.paymentIntent.method,method);assert.equal((sale.receipts||[]).length,0);await page.waitForSelector('#payment-dialog[open] .receipt-entry');
   assert.match(await page.$eval('#receipt-entries',element=>element.textContent),method==='cash'?/Dinheiro/:method==='pix'?/PIX/:/Cartão de crédito/);
   if(method==='cash'){assert.equal(sale.total,13900);assert.equal(sale.paymentIntent.cashTendered,15000);assert.match(await page.$eval('[data-receipt-value=change]',element=>element.textContent),/11,00/);}
   const catalog=(await api('/api/admin/products',undefined,owner)).data;assert.equal(catalog.find(product=>product.id===1).price,14900);
   await page.click('#payment-form [name=confirmed]');await page.click('#receipt-save');await page.waitForFunction(()=>!document.querySelector('#payment-dialog').open);
  }
  console.log('Atendimento: canais, filtros com contagem, transferência auditada, rascunhos e notas concorrentes.');
  await page.evaluate(()=>showView('whatsapp'));await page.waitForSelector('.inbox-filters .inbox-scopes');await page.evaluate(()=>[...document.querySelectorAll('.inbox-scopes button')].find(button=>button.textContent.startsWith('Todas ')).click());await page.waitForSelector('.inbox-row');
  assert.equal(await page.$$eval('.inbox-sources>button[aria-pressed]',elements=>elements.length),5);assert.equal(await page.$$eval('.inbox-state-filters button',elements=>elements.length),4);
  await choose(chatA);await assume();await fill('.inbox-message-input','Rascunho da Juliana');await choose(chatB);await assume();await fill('.inbox-message-input','Rascunho da Camila');await choose(chatA);assert.equal(await page.$eval('.inbox-message-input',element=>element.value),'Rascunho da Juliana');
  await clickText('.inbox-chat-head button','Transferir');await page.waitForSelector('.studio-dialog[open] select');await page.select('.studio-dialog[open] select',attendant.id);await fill('.studio-dialog[open] textarea','Cobertura durante o intervalo');await page.click('.studio-dialog[open] button[type=submit]');await page.waitForFunction(()=>!document.querySelector('.studio-dialog[open]'));
  await page.waitForFunction(()=>document.querySelector('.inbox-message-input').disabled);let timeline=(await api('/api/admin/attendance/whatsapp/chats/'+encodeURIComponent(chatA)+'/timeline',undefined,owner)).data;assert.equal(timeline.events[0].reason,'Cobertura durante o intervalo');await assume();
  const notesSelector='.inbox-customer>textarea';await page.waitForSelector(notesSelector);await fill(notesSelector,'Rascunho privado da Ana');
  let contact=(await api('/api/admin/attendance/whatsapp/chats/'+encodeURIComponent(chatA)+'/context',undefined,owner)).data;
  await api('/api/admin/attendance/customers/'+customer.id,{version:contact.info.version,tags:contact.info.tags,notes:'Informação salva por outro atendente'},owner,'PATCH');
  await page.$eval(notesSelector,element=>element.blur());await page.evaluate(()=>InboxWorkspace.contextChanged());await page.waitForSelector('.inbox-note-conflict');assert.equal(await page.$eval(notesSelector,element=>element.value),'Rascunho privado da Ana');
  await clickText('.inbox-note-conflict button','Conciliar as duas versões');await page.waitForSelector('.studio-dialog[open] textarea[readonly]');
  assert.equal(await page.$eval('.studio-dialog[open] textarea[readonly]',element=>element.value),'Informação salva por outro atendente');await fill('.studio-dialog[open] textarea:not([readonly])','Informação salva por outro atendente\nRascunho privado da Ana');await page.click('.studio-dialog[open] button[type=submit]');await page.waitForFunction(()=>!document.querySelector('.studio-dialog[open]'));
  contact=(await api('/api/admin/attendance/whatsapp/chats/'+encodeURIComponent(chatA)+'/context',undefined,owner)).data;assert.match(contact.info.notes,/outro atendente\nRascunho privado/);
  await clickText('.inbox-compose button','Nota interna');await fill('.inbox-message-input','Esta nota não pode ir para o cliente');await clickText('.inbox-compose-row button','Salvar nota');await page.waitForFunction(()=>document.querySelector('.inbox-stream').textContent.includes('Esta nota não pode ir para o cliente'));assert.equal(sent.length,0);assert.equal(await page.$$('.inbox-compose [data-inbox-voice]').then(items=>items.length),0);
  await clickText('.inbox-compose button','Mensagem');
  console.log('Anexos/áudio: trocar a conversa cancela o envio/gravação; texto em andamento mantém o destinatário.');
  const chooserPromise=page.waitForFileChooser();await clickText('.inbox-compose button','Anexo');const chooser=await chooserPromise;await choose(chatB);await chooser.accept([photo]);await page.waitForFunction(()=>document.querySelector('.inbox-feedback').textContent.includes('a conversa mudou'));assert.equal(media.length,0);
  await choose(chatA);await page.evaluate(()=>{
   window.__tracksStopped=0;
   const stream={getTracks:()=>[{stop:()=>window.__tracksStopped++}]};
   Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>stream});
   class Recorder{static isTypeSupported(type){return type==='audio/webm';}constructor(){this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['test'],{type:'audio/webm'})});this.onstop?.();});}}
   window.MediaRecorder=Recorder;
  });
  await clickText('.inbox-compose button','Áudio');await page.waitForFunction(()=>document.querySelector('[data-inbox-voice]')?.textContent.includes('Parar'));await choose(chatB);assert.ok(await page.evaluate(()=>window.__tracksStopped>0));assert.equal(await page.$$('dialog[open] audio').then(elements=>elements.length),0);assert.equal(media.length,0);
  await choose(chatA);const stoppedBefore=await page.evaluate(()=>window.__tracksStopped);await page.evaluate(()=>Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:()=>new Promise(resolve=>window.__resolveMicrophone=resolve)}));await clickText('.inbox-compose button','Áudio');await page.waitForFunction(()=>!!window.__resolveMicrophone);await choose(chatB);await choose(chatA);await page.evaluate(()=>window.__resolveMicrophone({getTracks:()=>[{stop:()=>window.__tracksStopped++}]}));await page.waitForFunction(before=>window.__tracksStopped>before,{},stoppedBefore);assert.equal(await page.evaluate(()=>document.querySelector('[data-inbox-voice]').textContent.includes('Parar')),false);
  await choose(chatA);await fill('.inbox-message-input','Texto enviado somente para Juliana');let release;delaySend=new Promise(resolve=>release=resolve);await clickText('.inbox-compose-row button','Enviar');await choose(chatB);await fill('.inbox-message-input','Outro rascunho da Camila');release();delaySend=null;
  await page.waitForFunction(()=>!document.querySelector('.inbox-message-input').disabled);await choose(chatA);await page.waitForFunction(()=>document.querySelector('.inbox-stream').textContent.includes('Texto enviado somente para Juliana'));assert.deepEqual(sent,[{id:chatA,body:'Texto enviado somente para Juliana'}]);await choose(chatB);assert.equal(await page.$eval('.inbox-message-input',element=>element.value),'Outro rascunho da Camila');await choose(chatA);
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(output,'atendimento.png'),fullPage:true});
  for(const view of ['workshop','whatsapp']){
   await page.evaluate(view=>showView(view),view);for(const theme of ['light','dark'])for(const width of [1674,1024,768,390]){
    await page.setViewport({width,height:940});await page.evaluate(theme=>AdminTheme.apply(theme),theme);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,view+' '+theme+' '+width);
   }
  }
  assert.deepEqual(errors,[]);console.log('Referências e fluxos validados. Capturas: '+output);
 }catch(error){if(page){await page.screenshot({path:path.join(output,'erro.png'),fullPage:true}).catch(()=>{});console.error(await page.evaluate(()=>({feedback:document.querySelector('.inbox-feedback')?.textContent,dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.textContent.slice(-1000))})).catch(()=>({})));}throw error;}
 finally{delaySend=null;await browser?.close();await app.locals.workshopService.stop();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(scratch,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
