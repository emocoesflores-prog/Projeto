/* Conexão compartilhada: mostra o estado real e preserva o vínculo ao recuperar. */
window.WhatsAppConnection=(()=>{
 const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 const titles={disconnected:'Conecte o WhatsApp da sua floricultura',starting:'Iniciando o WhatsApp…',qr:'Escaneie o QR Code no celular',authenticated:'Aparelho vinculado. Sincronizando…',syncing:'Recuperando o acesso às conversas…',ready:'WhatsApp conectado',disconnecting:'Encerrando a sessão…',error:'A conexão precisa de atenção'};
 let dialog=null,run=0,options;
 function button(text,fn,cls='secondary'){const b=node('button',text,cls);b.type='button';b.onclick=fn;return b;}
 async function open(config){
  close();options=config;const ticket=++run;let timer,controller,busy=false,state=null,revision=-1;
  const d=dialog=node('dialog',undefined,'studio-dialog whatsapp-connection-dialog');d.dataset.inboxOwned='true';d.setAttribute('aria-labelledby','whatsapp-connection-title');
  const heading=node('div',undefined,'wa-link-heading'),brand=node('span',undefined,'wa-link-brand'),copy=node('div'),title=node('h2','Conectar WhatsApp');title.id='whatsapp-connection-title';brand.append(ChannelIdentity.icon('whatsapp'));copy.append(title,node('p','Atendimento Multicanais · Conexão desta floricultura'));
  const dismiss=button('×',()=>d.close(),'wa-link-close');dismiss.setAttribute('aria-label','Fechar conexão do WhatsApp');heading.append(brand,copy,dismiss);
  const result=node('div',undefined,'wa-link-result'),indicator=node('div',undefined,'wa-link-state'),status=node('strong','Consultando conexão…'),diagnostic=node('p'),qr=node('img'),placeholder=node('div',undefined,'wa-link-placeholder');
  result.setAttribute('role','status');qr.alt='QR Code para vincular o WhatsApp da floricultura';qr.hidden=true;placeholder.append(UIIcons.icon('whatsapp'),node('span','O QR Code aparecerá aqui ao iniciar a conexão.'));indicator.append(status,diagnostic);
  const pairing=node('div',undefined,'wa-link-pairing'),guide=node('div',undefined,'wa-link-guide');guide.append(node('h3','Conecte em poucos passos'));
  const list=node('ol');for(const text of ['Abra o WhatsApp no celular da floricultura.','Toque em Configurações ou ⋮ e depois em Aparelhos conectados.','Toque em Conectar aparelho e escaneie o QR Code.'])list.append(node('li',text));guide.append(list,node('p','A sessão fica salva neste servidor. Você não precisa escanear novamente a cada acesso.','wa-link-hint'));pairing.append(qr,placeholder,guide);
  const feedback=node('p','','wa-link-feedback'),actions=node('div',undefined,'wa-link-actions');feedback.setAttribute('role','alert');
  const connect=button('Conectar WhatsApp',()=>act('connect'),'button'),recover=button('Recuperar sessão',()=>act('restart')),disconnect=button('Desconectar aparelho',async()=>{if(!confirm('Desconectar o aparelho? Será necessário escanear um novo QR Code para vincular novamente.'))return;await act('disconnect');}),refresh=button('Atualizar estado',()=>update());
  connect.dataset.waAction='connect';recover.dataset.waAction='restart';disconnect.dataset.waAction='disconnect';refresh.dataset.waAction='refresh';actions.append(connect,recover,disconnect,refresh);
  const details=node('details',undefined,'wa-link-help');details.append(node('summary','Ajuda com a conexão'),node('p','Se a sincronização não terminar, use Recuperar sessão. Essa opção reinicia a conexão e mantém o aparelho salvo. Para trocar de número ou remover o vínculo, use Desconectar aparelho.'));
  const link=node('a','Abrir guia de configuração');link.href='/integracoes-atendimento.html';link.target='_blank';link.rel='noopener';details.append(link);
  d.append(heading,result,indicator,pairing,feedback,actions,details);document.body.append(d);d.showModal();
  function active(){return ticket===run&&d.open;}
  function apply(s){
   if(!active()||(Number.isFinite(s.revision)&&s.revision<revision))return;if(Number.isFinite(s.revision))revision=s.revision;
   const previous=state?.status;state=s;d.dataset.connectionState=s.status;status.textContent=titles[s.status]||'Consultando conexão…';diagnostic.textContent=s.error||s.message||'';
   qr.hidden=!s.qr;placeholder.hidden=!!s.qr||s.status==='ready';guide.hidden=s.status==='ready';pairing.hidden=s.status==='ready';if(s.qr)qr.src=s.qr;else qr.removeAttribute('src');
   const canConnect=s.canConnect??['disconnected','error'].includes(s.status),canDisconnect=s.canDisconnect??['starting','qr','authenticated','syncing','ready'].includes(s.status);
   connect.hidden=s.status==='ready';connect.textContent=canConnect?'Conectar WhatsApp':['starting','qr','authenticated','syncing'].includes(s.status)?'Conexão em andamento…':'Aguarde a sessão anterior';connect.disabled=busy||!canConnect||!options.canManage;
   recover.hidden=!['authenticated','syncing','error'].includes(s.status);recover.disabled=busy||!options.canManage;
   disconnect.hidden=s.status==='disconnected';disconnect.textContent=['starting','qr'].includes(s.status)?'Cancelar conexão':'Desconectar aparelho';disconnect.disabled=busy||!canDisconnect||!options.canManage;refresh.disabled=busy;
   if(!options.canManage)feedback.textContent='O responsável da floricultura gerencia esta conexão. Você pode consultar o estado e usar os canais já conectados.';
   if(s.status==='ready'&&previous!=='ready')options.onReady?.();
  }
  async function request(path,body){const response=await fetch('/api/admin/whatsapp/'+path,{method:body===undefined?'GET':'POST',headers:{...options.auth(),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000),cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível consultar a conexão.');return data;}
  async function update(){if(!active()||busy)return;clearTimeout(timer);try{apply(await request('status'));}catch(error){if(active())feedback.textContent=error.message;}finally{if(active())timer=setTimeout(update,2500);}}
  async function act(action){if(busy||!active()||!options.canManage)return;busy=true;clearTimeout(timer);feedback.textContent=action==='restart'?'Reiniciando a conexão e preservando a sessão salva…':action==='connect'?'Iniciando conexão…':'Encerrando o vínculo…';if(state)apply(state);try{const next=await request(action,{});if(!active())return;feedback.textContent='';busy=false;apply(next);}catch(error){if(active())feedback.textContent=error.message;}finally{busy=false;if(active()){if(state)apply(state);await update();}}}
  async function live(){
   controller=new AbortController();try{const response=await fetch('/api/admin/whatsapp/events',{headers:config.auth(),signal:controller.signal,cache:'no-store'});if(!response.ok||!response.body)return;const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';while(active()){const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});let end;while((end=buffer.indexOf('\n\n'))!==-1){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);const data=block.split('\n').filter(line=>line.startsWith('data: ')).map(line=>line.slice(6)).join('\n');if(data)try{apply(JSON.parse(data));}catch{}}}}catch{/* Consulta periódica continua se o stream cair. */}
  }
  d.addEventListener('close',()=>{clearTimeout(timer);controller?.abort();if(dialog===d){dialog=null;++run;}qr.removeAttribute('src');d.remove();},{once:true});
  await update();if(active())void live();
 }
 function close(){if(dialog?.open)dialog.close();}
 return {open,close};
})();
