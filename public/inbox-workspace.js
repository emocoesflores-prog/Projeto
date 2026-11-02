/* Inbox compartilhado: o servidor decide a posse e registra cada ação. */
window.InboxWorkspace=(()=>{
 const names={whatsapp:'WhatsApp',instagram:'Instagram',facebook:'Facebook',gmail:'Gmail',outlook:'Outlook',imap:'E-mail'},n=(t,s,c)=>{const e=document.createElement(t);if(s!==undefined)e.textContent=s;if(c)e.className=c;return e;};
 let ctx,root,team,selected,desk,context,timer,visible=false,busy=false,epoch=0,source='all',scope='mine',state='all',owner='',search='',internal=false,conversationQuery='',drafts=new Map(),pendingSends=new Map(),queue=[],sources=[],presence='available',tick=0,quoted=null,recording=null,resizeObserver=null,refreshing=false,refreshPending=false,refreshGeneration=0,customerSequence=0,firstLoad=true,presenceChanging=false;const customerDrafts=new Map();
 const money=v=>(v/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),code=c=>c.provider+':'+c.id,initials=s=>String(s||'?').split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase(),time=t=>new Date(t).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
 const canSend=()=>!!desk&&!!team&&desk.assignedUserId===team.me.id&&desk.status!=='done';
 const emailProviders=['gmail','outlook','imap'];
 const matchesSource=c=>source==='all'||(source==='email'?emailProviders.includes(c.provider):source===c.provider);
 const fold=value=>String(value||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
 const preview=c=>typeof c.lastMessage==='object'?c.lastMessage?.body||c.preview||'':c.lastMessage||c.preview||'';
 const unread=c=>Number(c.unreadCount??c.unread??0)||0;
 const target=()=>selected?{provider:selected.provider,id:selected.id,key:code(selected),epoch,version:desk?.version||0}:null;
 const isCurrent=t=>!!t&&!!selected&&t.key===code(selected)&&t.epoch===epoch;
 const chatPath=(t,suffix='')=>'attendance/'+t.provider+'/chats/'+encodeURIComponent(t.id)+suffix;
 const sendPath=(t,suffix='')=>(t.provider==='whatsapp'?'whatsapp':'channels/'+t.provider)+'/chats/'+encodeURIComponent(t.id)+suffix;
 const report=s=>{if(root)root.querySelector('.inbox-feedback').textContent=s;};
 async function api(path,data,method='POST',extra={}){const response=await fetch('/api/admin/'+path,{method:data===undefined?'GET':method,headers:{...ctx.auth(),...(data instanceof Blob?{'Content-Type':'application/octet-stream'}:{'Content-Type':'application/json'}),...extra},...(data===undefined?{}:{body:data instanceof Blob?data:JSON.stringify(data)}),cache:'no-store',signal:AbortSignal.timeout(30000)});const result=await response.json();if(!response.ok)throw Error(result.error||'Não foi possível concluir a operação.');return result;}
 function b(text,action,cls='secondary'){const e=n('button',text,cls);e.type='button';e.onclick=async()=>{e.disabled=true;try{await action();}catch(error){report(error.message);}finally{e.disabled=false;}};return e;}
 function select(options,value,onchange,label){const e=n('select');e.setAttribute('aria-label',label);for(const [v,s]of options)e.append(new Option(s,v,false,value===v));e.onchange=()=>onchange(e.value);return e;}
 function modal(title,{conversation=true}={}){
  const d=n('dialog',undefined,'studio-dialog');d.dataset.inboxOwned='true';
  if(conversation&&selected)d.dataset.inboxConversation=code(selected);
  d.append(n('h2',title),b('Fechar',()=>d.close()));document.body.append(d);
  d.addEventListener('close',()=>d.remove(),{once:true});d.showModal();return d;
 }
 function closeConversationDialogs(){for(const d of document.querySelectorAll('dialog[data-inbox-conversation]'))d.close();}
 function stopRecording(discard=false){if(!recording)return;const job=recording;recording=null;job.discard=discard;clearTimeout(job.timer);if(job.recorder.state!=='inactive')job.recorder.stop();job.stream.getTracks().forEach(t=>t.stop());}

 async function mutate(input,expected=target()){
  if(!expected)throw Error('Selecione uma conversa.');
  const updated=await api(chatPath(expected),{...input,version:expected.version},'PATCH');
  const row=queue.find(c=>code(c)===expected.key);if(row)row.desk=updated;
  if(isCurrent(expected)){desk=updated;selected.desk=updated;head();compose();renderList();await customer();}
  return updated;
 }

 function build(){
  const old=document.querySelector('#view-whatsapp');root=n('div',undefined,'inbox-studio inbox-reviewed');old.prepend(root);
  const feedback=n('div','','inbox-feedback');feedback.setAttribute('role','status');root.append(feedback);
  const bar=n('div',undefined,'studio-toolbar inbox-sources'),layout=n('div',undefined,'inbox-columns');root.append(bar,layout);
  for(const cls of ['inbox-list studio-panel','inbox-conversation studio-panel','inbox-customer studio-panel'])layout.append(n('section',undefined,cls));
  const middle=layout.children[1];middle.append(n('div',undefined,'inbox-chat-head'),n('div',undefined,'inbox-assistant'),n('div',undefined,'inbox-stream'),n('div',undefined,'inbox-compose'));
  const left=layout.children[0],heading=n('div',undefined,'inbox-list-heading');
  heading.append(n('h2','Conversas'),b('＋',newConversation,'button'),b('↻',()=>refresh(true),'secondary'));
  heading.children[1].setAttribute('aria-label','Nova conversa');heading.children[2].setAttribute('aria-label','Atualizar conversas');left.append(heading);
  const query=n('input');query.type='search';query.placeholder='Buscar nome, número ou mensagem';query.setAttribute('aria-label',query.placeholder);
  query.oninput=()=>{search=query.value;filters();renderList();};left.append(query,n('div',undefined,'inbox-filters'),n('div',undefined,'inbox-rows'));
  old.classList.add('inbox-enabled');resizeObserver=new ResizeObserver(size);resizeObserver.observe(bar);resizeObserver.observe(feedback);requestAnimationFrame(size);
  head();
 }
 async function newConversation(){
  const d=modal('Nova conversa no WhatsApp',{conversation:false}),input=n('input');input.type='tel';input.placeholder='Telefone com DDD';input.setAttribute('aria-label','Telefone com DDD');
  d.append(input,b('Abrir conversa',async()=>{await openContact(input.value);d.close();},'button'));input.focus();
 }

 function size(){if(!root||!visible)return;const columns=root.querySelector('.inbox-columns');columns.style.setProperty('--inbox-height',Math.max(460,innerHeight-columns.getBoundingClientRect().top-12)+'px');}
 function channels(){
  if(!root||!team)return;const bar=root.querySelector('.inbox-sources');
  const signature=JSON.stringify([queue.map(c=>[c.provider]),source,sources,team.me,presence]);
  if(bar.dataset.signature===signature)return;
  if(bar.contains(document.activeElement)&&document.activeElement.tagName==='SELECT')return;
  bar.dataset.signature=signature;bar.replaceChildren();
  for(const [id,label]of [['all','Todos os canais'],['whatsapp','WhatsApp'],['instagram','Instagram'],['facebook','Facebook'],['email','E-mail']]){
   const count=queue.filter(c=>id==='all'||(id==='email'?emailProviders.includes(c.provider):c.provider===id)).length;
   const action=b('',()=>{source=id;bar.dataset.signature='';channels();filters();renderList();},source===id?'button':'secondary');
   action.setAttribute('aria-pressed',String(source===id));if(id!=='all')action.append(ChannelIdentity.icon(id));else action.append(UIIcons.icon('chat'));
   action.append(n('span',label),n('span',count,'inbox-tab-count'));bar.append(action);
  }
  const manage=b('Gerenciar canais',connections),operator=n('div',undefined,'inbox-operator'),avatar=n('span',initials(team.me.name),'studio-avatar');
  manage.prepend(UIIcons.icon('settings'));const availability=select([['available',team.me.name+' · Disponível'],['busy',team.me.name+' · Ocupado'],['away',team.me.name+' · Ausente']],presence,async value=>{
   const previous=presence;presence=value;presenceChanging=true;try{await api('attendance/presence',{status:value});bar.dataset.signature='';channels();}catch(error){presence=previous;bar.dataset.signature='';channels();report(error.message);}finally{presenceChanging=false;}
  },'Minha disponibilidade');operator.append(avatar,availability,b('Equipe',manageTeam));bar.append(manage,operator);
  for(const item of sources.filter(s=>s.error))report((names[item.provider]||item.provider)+': '+item.error);
 }

 function filters(){
  if(!root||!team)return;const box=root.querySelector('.inbox-filters');
  const base=queue.filter(c=>matchesSource(c)&&(!search||fold([c.name,c.id,preview(c)].join(' ')).includes(fold(search))));
  const scoped=base.filter(c=>(scope==='all'||(scope==='mine'?c.desk.assignedUserId===team.me.id:!c.desk.assignedUserId))&&(!owner||c.desk.assignedUserId===owner));
  const counts={all:scoped.length,unread:scoped.filter(c=>unread(c)>0).length,open:scoped.filter(c=>c.desk.status==='open').length,favorite:scoped.filter(c=>c.desk.favorite).length,done:scoped.filter(c=>c.desk.status==='done').length};
  const signature=JSON.stringify([source,scope,state,owner,counts,base.map(c=>[c.id,c.desk.assignedUserId]),team.users]);if(box.dataset.signature===signature)return;
  if(box.contains(document.activeElement)&&document.activeElement.tagName==='SELECT')return;box.dataset.signature=signature;box.replaceChildren();
  const scopes=n('div',undefined,'inbox-scopes');
  for(const [id,label]of [['mine','Minhas'],['unassigned','Não atribuídas'],['all','Todas']]){
   const count=base.filter(c=>id==='all'||(id==='mine'?c.desk.assignedUserId===team.me.id:!c.desk.assignedUserId)).length;
   const action=b(label+' '+count,()=>{scope=id;box.dataset.signature='';filters();renderList();},scope===id?'button':'secondary');action.setAttribute('aria-pressed',String(scope===id));scopes.append(action);
  }
  box.append(scopes,select([['','Responsável: todos'],...team.users.map(u=>[u.id,u.name])],owner,value=>{owner=value;box.dataset.signature='';filters();renderList();},'Responsável'));
  const statuses=n('div',undefined,'inbox-state-filters');statuses.setAttribute('role','group');statuses.setAttribute('aria-label','Estado das conversas');
  for(const [id,label,icon]of [['unread','Não lidas','chat'],['open','Em atendimento','pickup'],['favorite','Favoritas','star'],['done','Concluídas','checkCircle']]){
   const action=b('',()=>{state=state===id?'all':id;box.dataset.signature='';filters();renderList();},state===id?'button':'secondary');
   action.dataset.inboxState=id;action.setAttribute('aria-pressed',String(state===id));action.append(UIIcons.icon(icon),n('span',label),n('span',counts[id],'inbox-tab-count'));statuses.append(action);
  }
  box.append(statuses);if(state!=='all')box.append(b('Limpar filtro de estado',()=>{state='all';box.dataset.signature='';filters();renderList();},'text-button'));
 }

 function renderList(){
  if(!root)return;const list=root.querySelector('.inbox-rows');
  const rows=queue.filter(c=>matchesSource(c)&&(scope==='all'||(scope==='mine'?c.desk.assignedUserId===team?.me.id:!c.desk.assignedUserId))&&(!owner||c.desk.assignedUserId===owner)&&(state==='all'||(state==='unread'?unread(c)>0:state==='favorite'?c.desk.favorite:state==='open'?c.desk.status==='open':c.desk.status==='done'))&&(!search||fold([c.name,c.id,preview(c)].join(' ')).includes(fold(search))));
  const signature=JSON.stringify([rows,selected&&code(selected)]);if(list.dataset.signature===signature)return;list.dataset.signature=signature;
  const scroll=list.scrollTop;list.replaceChildren();
  for(const c of rows){
   const row=b('',()=>choose(c),'inbox-row'+(selected&&code(c)===code(selected)?' selected':'')),avatar=n('span',initials(c.name||c.id),'studio-avatar'),body=n('span',undefined,'inbox-row-copy');
   row.dataset.chatId=c.id;row.dataset.provider=c.provider;row.setAttribute('aria-pressed',String(!!selected&&code(c)===code(selected)));
   const title=n('strong',c.name||c.id),assignment=n('small',undefined,'inbox-row-owner');assignment.append(document.createTextNode('Responsável: '),n('span',c.desk.assignedTo||'Não atribuído'));
   body.append(title,n('small',preview(c)||'Sem prévia'),assignment);row.append(avatar,ChannelIdentity.icon(c.provider),body);
   const meta=n('span',undefined,'inbox-row-meta');if(c.timestamp){const stamp=n('small',new Date(c.timestamp*1000).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}));stamp.title=time(c.timestamp*1000);meta.append(stamp);}if(unread(c))meta.append(n('span',unread(c),'studio-count'));row.append(meta);list.append(row);
  }
  if(!rows.length)list.append(n('p','Nenhuma conversa neste filtro.','inbox-empty'));list.scrollTop=scroll;
  const footer=root.querySelector('.inbox-list-live')||n('p',undefined,'inbox-list-live');footer.textContent='● Atualização em tempo real · '+queue.length+' conversas carregadas';root.querySelector('.inbox-list').append(footer);
 }

 function remember(){const input=root?.querySelector('.inbox-message-input');if(selected&&input)drafts.set(code(selected)+(internal?':note':''),input.value);}
 async function choose(c){
  remember();const wasRecording=!!recording;stopRecording(true);report(wasRecording?'Gravação cancelada ao trocar de conversa. O áudio não foi enviado.':'');closeConversationDialogs();selected=c;quoted=null;internal=false;desk=c.desk;const ticket=++epoch;customerSequence++;
  const stream=root.querySelector('.inbox-stream');stream.dataset.signature='';stream.scrollTop=0;stream.replaceChildren(n('p','Carregando conversa…'));
  head();compose();renderList();try{
   const expected=target(),current=await api(chatPath(expected));if(ticket!==epoch)return;desk=current;c.desk=current;head();compose();await Promise.all([messages(ticket),customer(ticket)]);
  }catch(error){if(ticket===epoch)report(error.message);}
 }

 function head(){
  if(!root)return;const h=root.querySelector('.inbox-chat-head'),assistant=root.querySelector('.inbox-assistant');h.replaceChildren();assistant.replaceChildren();assistant.hidden=true;
  if(!selected){h.append(n('h2','Selecione uma conversa'));root.querySelector('.inbox-compose').replaceChildren();return;}
  const expected=target(),identity=n('div',undefined,'inbox-contact-heading'),avatar=n('span',initials(selected.name||selected.id),'studio-avatar'),copy=n('div'),line=n('div',undefined,'inbox-contact-title');
  line.append(n('h2',selected.name||selected.id),ChannelIdentity.badge(selected.provider));copy.append(line);
  const phone=n('small',isCurrent(expected)&&context?.conversationKey===expected.key&&context.phone?CustomerDirectory.formatPhone(context.phone):'','inbox-contact-phone');copy.append(phone);identity.append(avatar,copy);
  const actions=n('div',undefined,'inbox-conversation-actions'),assigned=team.users.find(u=>u.id===desk.assignedUserId),responsible=n('span',undefined,'inbox-responsible');responsible.append(n('small','Responsável'),n('strong',assigned?.name||'Não atribuído'));
  actions.append(responsible,b('Transferir',()=>transfer(expected),'secondary'));
  if(desk.assignedUserId!==team.me.id)actions.append(b('Assumir',()=>mutate({action:'claim'},expected),'button'));
  actions.append(b(desk.status==='done'?'Reabrir':'Concluir',()=>mutate({action:'update',patch:{status:desk.status==='done'?'open':'done'}},expected),'button'));
  const favorite=b(desk.favorite?'★':'☆',()=>mutate({action:'update',patch:{favorite:!desk.favorite}},expected),'secondary inbox-icon-action');favorite.setAttribute('aria-label',desk.favorite?'Remover dos favoritos':'Favoritar conversa');favorite.setAttribute('aria-pressed',String(!!desk.favorite));actions.append(favorite,b('⋯',()=>conversationMenu(expected),'secondary inbox-icon-action'));
  h.append(identity,actions);
  const query=n('input');query.type='search';query.placeholder='Buscar nesta conversa';query.value=conversationQuery;query.hidden=!conversationQuery;query.setAttribute('aria-label',query.placeholder);
  query.oninput=()=>{conversationQuery=query.value;root.querySelectorAll('.inbox-bubble').forEach(e=>e.hidden=!!conversationQuery&&!fold(e.textContent).includes(fold(conversationQuery)));};
  const searchButton=b('⌕',()=>{query.hidden=!query.hidden;if(!query.hidden)query.focus();},'secondary inbox-icon-action');searchButton.setAttribute('aria-label','Buscar mensagens');actions.insertBefore(searchButton,favorite);h.append(query);
  if(selected.provider==='whatsapp'){
   assistant.hidden=false;const brand=n('div',undefined,'inbox-assistant-brand'),logo=n('span',undefined,'studio-avatar');logo.append(UIIcons.icon('flower'));brand.append(logo,n('strong',ctx.settings()?.assistantName||'Assistente'),n('span','· Assistente virtual'));
   const toggle=b('',()=>mutate({action:'update',patch:{aiEnabled:!desk.aiEnabled}},expected),'inbox-assistant-switch');toggle.setAttribute('role','switch');toggle.setAttribute('aria-label','Sugestões da assistente nesta conversa');toggle.setAttribute('aria-checked',String(!!desk.aiEnabled));toggle.append(n('span',desk.aiEnabled?'Ativada nesta conversa':'Desativada nesta conversa'),n('span',undefined,'inbox-switch-track'));
   const config=b('Configurar assistente',()=>{ctx.configureAssistant?.();});config.prepend(UIIcons.icon('settings'));config.disabled=team.me.role!=='owner';if(config.disabled)config.title='A configuração é gerenciada pelo responsável da floricultura.';assistant.append(brand,toggle,config,n('small','O atendente assume a conversa e revisa as sugestões antes de enviar.'));
  }
 }
 function transfer(expected){
  const d=modal('Transferir atendimento'),form=n('form'),label=n('label','Novo responsável'),choice=select([['','Não atribuído'],...team.users.filter(u=>u.active).map(u=>[u.id,u.name+(u.presence?.online?' · '+({available:'Disponível',busy:'Ocupado',away:'Ausente'})[u.presence.status]:' · Offline')])],desk.assignedUserId||'',()=>{},'Novo responsável');
  label.append(choice);const why=n('label','Motivo da transferência (opcional)'),reason=n('textarea');reason.maxLength=300;why.append(reason);const status=n('p'),save=n('button','Confirmar transferência','button');save.type='submit';form.append(label,why,status,save);d.append(form);
  form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{await mutate({action:'assign',userId:choice.value||null,reason:reason.value.trim()},expected);d.close();}catch(error){status.textContent=error.message;}finally{save.disabled=false;}};
 }
 function conversationMenu(expected){
  const d=modal('Ações do atendimento');d.append(b('Histórico de ações da equipe',()=>{d.close();timeline(expected);}),b('Atualizar conversa',async()=>{d.close();if(isCurrent(expected))await choose(selected);}),b('Vincular cliente',()=>{d.close();linkCustomer(expected);}));
 }
 async function timeline(expected){
  const d=modal('Histórico do atendimento'),rows=n('div'),more=b('Carregar ações anteriores',load);let before=null,loading=false;d.append(rows,more);
  async function load(){if(loading)return;loading=true;try{const page=await api(chatPath(expected,'/timeline'+(before?'?before='+before:'')));if(!d.open)return;for(const event of page.events){const row=n('article',undefined,'inbox-audit-row');row.append(n('strong',event.actor?.name||'Equipe'),n('p',({claim:'Assumiu o atendimento',assign:'Transferiu o atendimento',update:'Atualizou o atendimento',link:'Vinculou um cliente',note:'Registrou nota interna'})[event.action]||event.action),n('small',time(event.at)));if(event.reason)row.append(n('p','Motivo: '+event.reason));rows.append(row);}before=page.nextBefore;more.hidden=!before;if(!rows.childElementCount)rows.append(n('p','Nenhuma ação registrada.'));}catch(error){report(error.message);}finally{loading=false;}}
  await load();
 }

 async function messages(ticket=epoch){
  if(!selected)return;const expected=target(),[rows,history]=await Promise.all([api(chatPath(expected,'/messages')),api(chatPath(expected,'/timeline'))]);
  if(ticket!==epoch||!isCurrent(expected)||!root)return;
  const stream=root.querySelector('.inbox-stream'),atEnd=stream.scrollHeight-stream.scrollTop-stream.clientHeight<80,oldTop=stream.scrollTop;
  const anchor=[...stream.children].find(e=>e.dataset.entryKey&&e.getBoundingClientRect().bottom>stream.getBoundingClientRect().top),anchorKey=anchor?.dataset.entryKey,anchorOffset=anchor?anchor.getBoundingClientRect().top-stream.getBoundingClientRect().top:0;
  const entries=[...rows.map(m=>({...m,type:'message',at:new Date((m.timestamp||0)*1000).toISOString()})),...(history.notes||[]).map(m=>({...m,type:'note',at:m.at||m.createdAt})),...(history.events||[]).filter(e=>e.action!=='note').map(e=>({...e,type:'event'}))].sort((a,b)=>String(a.at).localeCompare(String(b.at)));
  const signature=expected.key+'\n'+JSON.stringify(entries);if(stream.dataset.signature===signature)return;const first=!stream.dataset.signature;stream.dataset.signature=signature;stream.replaceChildren();
  if(desk.legacyNotes)stream.append(n('p','Nota anterior: '+desk.legacyNotes,'inbox-system'));
  for(const m of entries){
   if(m.type==='event'){const event=n('p',(m.actor?.name||'Equipe')+' · '+({claim:'assumiu o atendimento',assign:'transferiu o atendimento',link:'vinculou o cliente',update:'atualizou o atendimento'}[m.action]||m.action)+(m.reason?' · '+m.reason:'')+' · '+time(m.at),'inbox-system');event.dataset.entryKey='event:'+m.id;stream.append(event);continue;}
   const note=m.type==='note',box=n('article',undefined,'inbox-bubble'+(note?' internal':m.fromMe?' sent':''));box.dataset.entryKey=m.type+':'+m.id;
   box.append(n('strong',note?'Nota interna · '+m.actorName:m.fromMe?(m.operator?.name||m.operator?.actorName||'Equipe / aparelho'):selected.name||'Cliente'),n('p',m.body||m.caption||(m.hasMedia?'Anexo':'')));
   const meta=n('div',undefined,'inbox-message-meta'),stamp=n('small',new Date(m.at).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}));stamp.title=time(m.at);meta.append(stamp);
   if(!note&&selected.provider==='whatsapp'){
    if(m.fromMe&&Number.isInteger(m.ack)){const ack=n('span',m.ack<0?'!':m.ack===0?'◷':m.ack===1?'✓':'✓✓','inbox-message-ack');ack.dataset.read=String(m.ack>=3);ack.title=m.ack<0?'Falha no envio':m.ack===0?'Aguardando envio':m.ack===1?'Enviada':m.ack===2?'Recebida':'Lida';meta.append(ack);}
    if(m.hasMedia)box.append(b('Baixar anexo',()=>downloadMedia(expected,m)));
    const reply=b('Responder',()=>{if(!isCurrent(expected))return;quoted=m.id;report('Resposta vinculada à mensagem selecionada.');root.querySelector('.inbox-message-input').focus();},'quiet inbox-reply-action');reply.setAttribute('aria-label','Responder esta mensagem');meta.append(reply);
   }
   box.append(meta);box.hidden=!!conversationQuery&&!fold(box.textContent).includes(fold(conversationQuery));stream.append(box);
  }
  if(!entries.length)stream.append(n('p','Nenhuma mensagem disponível neste canal.','inbox-empty'));
  if(first||atEnd)stream.scrollTop=stream.scrollHeight;
  else{const restored=[...stream.children].find(e=>e.dataset.entryKey===anchorKey);stream.scrollTop=oldTop;if(restored)stream.scrollTop+=restored.getBoundingClientRect().top-stream.getBoundingClientRect().top-anchorOffset;}
 }
 async function downloadMedia(expected,message){
  const response=await fetch('/api/admin/'+sendPath(expected,'/messages/'+encodeURIComponent(message.id)+'/media'),{headers:ctx.auth(),signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Não foi possível baixar o anexo.');const url=URL.createObjectURL(await response.blob()),link=n('a');link.href=url;link.download=message.filename||'anexo';link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
 }

 function compose(){
  if(!root)return;const host=root.querySelector('.inbox-compose');host.replaceChildren();if(!selected)return;
  const expected=target(),noteMode=internal,tools=n('div',undefined,'studio-toolbar'),input=n('textarea',undefined,'inbox-message-input');input.maxLength=4000;input.rows=2;
  input.placeholder=noteMode?'Nota visível somente para a equipe…':canSend()?'Digite uma mensagem…':'Assuma o atendimento para responder';input.value=drafts.get(expected.key+(noteMode?':note':''))||'';input.disabled=!noteMode&&!canSend();input.oninput=remember;
  const changeMode=value=>{remember();internal=value;if(value)stopRecording(true);compose();};
  tools.append(b('Mensagem',()=>changeMode(false),!noteMode?'button':'secondary'),b('Nota interna',()=>changeMode(true),noteMode?'button':'secondary'),b('Respostas rápidas',()=>quickReplies(input,expected)),b('Enviar catálogo',()=>{insert(input,(ctx.settings()?.publicUrl||location.origin)+'/',expected);}));
  if(expected.provider==='whatsapp'&&!noteMode){
   const suggestion=b('Sugerir resposta',async()=>{if(!desk.aiEnabled)throw Error('Habilite a assistente nesta conversa.');const result=await api(sendPath(expected,'/suggestion'),{});if(isCurrent(expected)&&input.isConnected)insert(input,result.text,expected);});
   const attach=b('Anexo',()=>pickFile(expected)),voice=b(recording?'Parar gravação':'Áudio',()=>recordVoice(expected));for(const action of [attach,voice,suggestion])action.disabled=!canSend();voice.dataset.inboxVoice='';tools.append(suggestion,attach,voice);
  }
  const emoji=b('😊',()=>emojis(input,expected));emoji.setAttribute('aria-label','Escolher emoji');tools.append(emoji);
  const status=n('div',undefined,'inbox-composer-context');if(quoted&&!noteMode){const clear=b('×',()=>{quoted=null;compose();},'quiet');clear.setAttribute('aria-label','Cancelar resposta vinculada');status.append(n('span','Respondendo à mensagem selecionada'),clear);}
  if(!noteMode&&!canSend())status.append(n('span',desk.status==='done'?'Atendimento concluído. Reabra para responder.':desk.assignedUserId?'Esta conversa está com outro atendente. Solicite a transferência.':'Assuma o atendimento para enviar mensagens.'));
  const send=b(noteMode?'Salvar nota':'Enviar',async()=>{
   if(busy||!isCurrent(expected)||!input.isConnected)return;const body=input.value.trim();if(!body)return;
   const key=expected.key+(noteMode?':note':':message'),previous=pendingSends.get(key),id=previous?.body===body&&previous.quoted===quoted?previous.id:crypto.randomUUID(),text=input.value,quoteId=quoted;
   pendingSends.set(key,{id,body,quoted:quoteId});busy=true;input.disabled=true;
   try{
    if(noteMode)await api(chatPath(expected,'/notes'),{operationId:id,body});
    else await api(sendPath(expected,'/messages'),{body,...(quoteId?{quotedMessageId:quoteId}:{})},'POST',{'X-Operation-Id':id});
    pendingSends.delete(key);if(drafts.get(expected.key+(noteMode?':note':''))===text)drafts.delete(expected.key+(noteMode?':note':''));
    if(isCurrent(expected)){if(input.isConnected)input.value='';quoted=null;await messages();report(noteMode?'Nota registrada somente para a equipe.':'Mensagem enviada.');}
   }finally{busy=false;if(input.isConnected)input.disabled=!noteMode&&!canSend();}
  },'button');send.disabled=!noteMode&&!canSend();input.onkeydown=e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();send.click();}};
  const row=n('div',undefined,'inbox-compose-row');row.append(input,send);host.append(tools,status,row);
 }
 function insert(input,text,expected){
  if(!isCurrent(expected)||!input.isConnected)return;if(input.disabled)throw Error('Assuma o atendimento antes de responder.');
  const start=input.selectionStart??input.value.length,end=input.selectionEnd??start;if(input.value.length-(end-start)+text.length>4000)throw Error('A mensagem deve ter até 4.000 caracteres.');input.setRangeText(text,start,end,'end');input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();
 }
 function quickReplies(input,expected){
  const d=modal('Respostas rápidas');for(const text of ['Olá! Como posso ajudar com seu presente?','Vou conferir a disponibilidade e o prazo para você.','Seu pedido está em preparação. Obrigado pela confiança!'])d.append(b(text,()=>{insert(input,text,expected);d.close();}));
 }
 function emojis(input,expected){
  const d=modal('Escolher emoji'),search=n('input'),list=n('div',undefined,'inbox-emoji-grid');search.type='search';search.placeholder='Buscar: sorriso, flores, amor…';search.setAttribute('aria-label','Buscar emoji');
  const groups=window.WhatsAppEmojis||[{name:'Emojis',words:'',items:'😊 🌷 🌻 ❤️ 👍 🎁'}];function draw(){list.replaceChildren();for(const group of groups.filter(g=>!search.value||fold(g.name+' '+g.words+' '+g.items).includes(fold(search.value))))for(const emoji of group.items.split(' ')){const action=b(emoji,()=>{insert(input,emoji,expected);d.close();},'secondary');action.setAttribute('aria-label',emoji);list.append(action);}}search.oninput=draw;d.append(search,list);draw();search.focus();
 }
 function pickFile(expected){
  const input=n('input');input.type='file';input.accept='image/jpeg,image/png,image/webp,application/pdf,audio/mpeg,audio/ogg,audio/mp4,audio/webm,video/mp4';
  input.onchange=()=>{if(!input.files[0])return;sendFile(input.files[0],false,expected).catch(error=>report(error.message));};input.click();
 }
 async function recordVoice(expected){
  if(recording){stopRecording();return;}
  if(!isCurrent(expected)||internal||!canSend())throw Error('Assuma o atendimento antes de gravar para o cliente.');
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error('Este navegador não permite gravar áudio. Use Anexo para enviar um arquivo.');
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});if(!isCurrent(expected)||internal||!visible){stream.getTracks().forEach(t=>t.stop());return;}
  const mime=['audio/webm','audio/mp4','audio/ogg'].find(type=>MediaRecorder.isTypeSupported(type));if(!mime){stream.getTracks().forEach(t=>t.stop());throw Error('Este navegador não disponibilizou um formato de áudio compatível.');}
  let recorder;try{recorder=new MediaRecorder(stream,{mimeType:mime});}catch(error){stream.getTracks().forEach(t=>t.stop());throw error;}
  const job={recorder,stream,expected,discard:false,chunks:[],timer:null};recording=job;recorder.ondataavailable=e=>{if(e.data.size)job.chunks.push(e.data);};
  recorder.onstop=()=>{
   clearTimeout(job.timer);stream.getTracks().forEach(t=>t.stop());if(recording===job)recording=null;
   if(job.discard||!isCurrent(expected)||!visible||internal)return;
   const blob=new Blob(job.chunks,{type:mime}),url=URL.createObjectURL(blob),d=modal('Conferir áudio para '+(selected.name||selected.id)),audio=n('audio');audio.controls=true;audio.src=url;
   const extension=mime==='audio/mp4'?'m4a':mime==='audio/ogg'?'ogg':'webm';d.append(audio,b('Enviar áudio',async()=>{await sendFile(new File([blob],'audio.'+extension,{type:mime}),true,expected);d.close();},'button'));d.addEventListener('close',()=>URL.revokeObjectURL(url),{once:true});compose();
  };
  recorder.onerror=()=>{job.discard=true;stopRecording(true);report('A gravação falhou. Confira o microfone e tente novamente.');};recorder.start();job.timer=setTimeout(()=>{if(recording===job)stopRecording();},60000);compose();report('Gravando para '+(selected.name||selected.id)+'. Clique em Parar gravação para conferir o áudio (máximo de 60 segundos).');
 }

 async function sendFile(file,voice=false,expected=target()){
  if(!isCurrent(expected))throw Error('O anexo não foi enviado: a conversa mudou. Selecione o destinatário e anexe novamente.');
  if(internal)throw Error('Anexos e áudios são enviados no modo Mensagem.');
  if(!canSend())throw Error('Assuma o atendimento antes de enviar.');
  if(!file.size||file.size>8*1024*1024)throw Error('Selecione arquivo de até 8 MB.');
  const allowed=['image/jpeg','image/png','image/webp','application/pdf','audio/mpeg','audio/ogg','audio/mp4','audio/webm','video/mp4'];if(!allowed.includes(file.type))throw Error('Use imagem JPG/PNG/WebP, PDF, áudio ou vídeo MP4.');
  await api(sendPath(expected,'/media?'+new URLSearchParams({mime:file.type,filename:file.name,voice:voice?'1':'0'})),file,'POST',{'X-Operation-Id':crypto.randomUUID()});
  if(isCurrent(expected)){await messages();report('Anexo enviado.');}
 }

 async function customer(ticket=epoch){
  if(!selected)return;const expected=target(),sequence=++customerSequence,result=await api(chatPath(expected,'/context'));
  if(ticket!==epoch||sequence!==customerSequence||!isCurrent(expected)||!root)return;
  context={...result,conversationKey:expected.key};const host=root.querySelector('.inbox-customer');host.replaceChildren();
  const title=n('div',undefined,'inbox-customer-heading');title.append(UIIcons.label('pickup','Cliente e pedidos'));host.append(title);
  const link=b(result.customer?'Buscar ou trocar cliente':'Buscar ou vincular cliente',()=>linkCustomer(expected),'secondary inbox-link-customer');link.prepend(UIIcons.icon('search'));host.append(link);
  const c=result.customer;
  if(c){
   const identity=n('div',undefined,'inbox-customer-identity'),copy=n('div'),actions=n('div',undefined,'studio-toolbar');copy.append(n('span','✓ Cliente cadastrado','inbox-registered'),n('h3',c.name),UIIcons.label('phone',CustomerDirectory.formatPhone(c.phone)));if(c.email)copy.append(UIIcons.label('email',c.email));
   identity.append(n('div',initials(c.name),'studio-avatar'),copy);actions.append(b('Ver cadastro',()=>profile(c)),b('✎',()=>profile(c,true)));actions.lastChild.setAttribute('aria-label','Editar cadastro do cliente');identity.append(actions);host.append(identity);
  }else host.append(n('p',result.phone?'Telefone: '+CustomerDirectory.formatPhone(result.phone):'Vincule um cliente para consultar o cadastro, pedidos, tags e notas.','inbox-empty'));
  const heading=n('div',undefined,'inbox-orders-heading');heading.append(UIIcons.label('cart','Pedidos do cliente'),n('span',result.orders.length,'inbox-tab-count'));
  if(result.orders.length)heading.append(b('Ver histórico',()=>orderHistory(expected),'text-button'));host.append(heading,b('＋ Novo pedido',()=>FloristPOS.open({customer:c,phone:result.phone||c?.phone,channel:expected.provider}),'button'));
  const orders=n('div',undefined,'inbox-customer-orders');host.append(orders);for(const order of result.orders.slice(0,2))orders.append(orderCard(order));
  if(!result.orders.length)orders.append(n('p','Nenhum pedido encontrado para este cliente.','inbox-empty'));

  if(c){
   const info=result.info,draft=customerDrafts.get(c.id),tags=n('div',undefined,'studio-toolbar inbox-customer-tags');host.append(UIIcons.label('tag','Tags do cliente'));
   for(const tag of info.tags)tags.append(b(tag+' ×',()=>saveInfo(c.id,info,{tags:info.tags.filter(t=>t!==tag),notes:info.notes})));
   const add=b('＋',()=>{const d=modal('Nova tag'),input=n('input');input.maxLength=40;input.setAttribute('aria-label','Nome da tag');d.append(input,b('Adicionar',async()=>{await saveInfo(c.id,info,{tags:[...info.tags,input.value.trim()],notes:info.notes});d.close();},'button'));input.focus();});add.setAttribute('aria-label','Adicionar tag');tags.append(add);host.append(tags,UIIcons.label('clipboard','Notas do cliente'));
   const notes=n('textarea');notes.maxLength=2000;notes.placeholder='Adicionar uma informação para a equipe…';notes.setAttribute('aria-label','Notas do cliente');notes.value=draft?.notes??info.notes;
   notes.oninput=()=>{if(notes.value===info.notes)customerDrafts.delete(c.id);else customerDrafts.set(c.id,{version:draft?.version??info.version,notes:notes.value});};
   host.append(notes,b('Salvar notas da equipe',()=>{const local=customerDrafts.get(c.id);return saveInfo(c.id,{...info,version:local?.version??info.version},{tags:info.tags,notes:notes.value},{notes:true});}));
   if(draft&&draft.version!==info.version){const conflict=n('div',undefined,'inbox-note-conflict');conflict.append(n('p','As notas foram atualizadas por outra pessoa. Seu texto foi preservado; confira a versão atual antes de substituir.'),b('Ver notas atuais',()=>{const d=modal('Notas atuais do cliente');d.append(n('p',info.notes||'Nenhuma nota registrada.'));}),b('Conciliar as duas versões',()=>reconcileNotes(c.id,info,draft)),b('Descartar meu rascunho',async()=>{if(confirm('Descartar apenas o seu texto ainda não salvo e carregar as notas atuais?')){customerDrafts.delete(c.id);await customer();}}));host.append(conflict);}
  }
  const phone=root.querySelector('.inbox-contact-phone');if(phone)phone.textContent=result.phone?CustomerDirectory.formatPhone(result.phone):c?CustomerDirectory.formatPhone(c.phone):'';
 }
 function orderCard(order){
  const card=b('',()=>AttendanceOrders.openOrder(order.id),'inbox-order'),top=n('div',undefined,'inbox-order-top');top.append(n('strong','#'+order.id.slice(0,8).toUpperCase()),n('small',order.date?order.date.split('-').reverse().join('/'):'—'),n('strong',money(order.total)));card.append(top);
  const body=n('div',undefined,'inbox-order-body'),item=order.items?.[0];if(item?.image){const image=n('img');image.src=ProductArt.url(item.image);image.alt='';image.loading='lazy';body.append(image);}const copy=n('div');copy.append(n('span',(order.items||[]).map(i=>i.name).join(', ')));const badges=n('div',undefined,'studio-toolbar');badges.append(n('span',({paid:'✓ Pago',partial:'Parcial',pending:'Pendente'})[order.paymentStatus]||order.paymentStatus,'inbox-order-payment payment-'+order.paymentStatus),n('span',order.status,'inbox-order-status'));copy.append(badges);body.append(copy,n('small','Abrir pedido ›','inbox-order-open'));card.append(body);return card;
 }
 function linkCustomer(expected=target()){
  const d=modal('Vincular cliente');const picker=CustomerPicker.mount(d,{onSelect:async c=>{try{await mutate({action:'link',customerId:c.id},expected);d.close();}catch(error){report(error.message);}}});d.addEventListener('close',()=>picker.destroy(),{once:true});
 }
 async function orderHistory(expected){
  const d=modal('Histórico de pedidos do cliente'),list=n('div'),more=b('Carregar pedidos anteriores',load);let offset=0,loading=false;d.append(list,more);
  async function load(){if(loading)return;loading=true;try{const page=await api(chatPath(expected,'/context?offset='+offset));if(!d.open)return;for(const order of page.orders)list.append(orderCard(order));offset=page.nextOffset;more.hidden=offset===null;if(!list.childElementCount)list.append(n('p','Nenhum pedido encontrado.'));}catch(error){report(error.message);}finally{loading=false;}}
  await load();
 }

 async function profile(value,editing=false){const expected=target();const c=await CustomerDirectory.get(value.id);if(!isCurrent(expected))return;const d=modal('Cadastro do cliente'),content=n('div');d.append(content);function draw(){content.replaceChildren(n('h3',c.name),n('p',CustomerDirectory.formatPhone(c.phone)),n('p',c.email||'E-mail não informado'),n('p',c.preferences||'Sem preferências registradas'),b('Gerenciar endereços',()=>DeliveryAddressBook.open({customer:c,manage:true,onSelected:()=>{}})),b('Editar cadastro',async()=>{if(!desk.customerId)await mutate({action:'link',customerId:c.id},expected);edit();}));}function edit(){const form=n('form'),fields=['name','phone','email','preferences'];for(const [key,label,type]of [['name','Nome completo','text'],['phone','WhatsApp com DDD','tel'],['email','E-mail','email'],['preferences','Preferências','text']]){const l=n('label',label),input=n('input');input.name=key;input.type=type;input.value=c[key]||'';input.required=['name','phone'].includes(key);input.maxLength=key==='preferences'?500:key==='email'?254:120;l.append(input);form.append(l);}const status=n('p'),save=n('button','Salvar alterações','button');form.append(status,save);form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{await api('customers/'+c.id,{version:c.version||0,fields:Object.fromEntries(fields.map(key=>[key,form.elements[key].value.trim()]))},'PATCH');d.close();await customer();}catch(e){status.textContent=e.message;}finally{save.disabled=false;}};content.replaceChildren(form);}if(editing){if(!desk.customerId)await mutate({action:'link',customerId:c.id},expected);edit();}else draw();}
 function reconcileNotes(customerId,info,draft){
  const d=modal('Conciliar notas da equipe'),form=n('form'),current=n('label','Notas atuais salvas pela equipe'),source=n('textarea'),edit=n('label','Texto conciliado que será salvo'),merged=n('textarea'),status=n('p'),save=n('button','Salvar texto conciliado','button');
  source.readOnly=true;source.value=info.notes;current.append(source);merged.value=customerDrafts.get(customerId)?.notes??draft.notes;merged.maxLength=2000;edit.append(merged);save.type='submit';form.append(current,edit,status,save);d.append(n('p','Confira as informações da equipe e reúna o que precisa permanecer no texto abaixo.'),form);
  form.onsubmit=async event=>{event.preventDefault();save.disabled=true;try{customerDrafts.set(customerId,{version:info.version,notes:merged.value});await saveInfo(customerId,info,{tags:info.tags,notes:merged.value},{notes:true});d.close();}catch(error){status.textContent=error.message;}finally{save.disabled=false;}};
 }

 async function saveInfo(customerId,info,values,{notes=false}={}){
  const saved=await api('attendance/customers/'+customerId,{version:info.version,...values},'PATCH'),draft=customerDrafts.get(customerId);
  if(notes){if(!draft||draft.notes===values.notes)customerDrafts.delete(customerId);}
  else if(draft&&draft.version===info.version)draft.version=saved.version;
  if(context?.customer?.id===customerId)await customer();return saved;
 }

 async function connections(){const d=modal('Gerenciar canais',{conversation:false});for(const [p,label]of Object.entries(names))d.append(b(label,()=>p==='whatsapp'?waConnection():AttendanceChannels.open(p)));}
 async function waConnection(){const d=modal('Conectar WhatsApp',{conversation:false}),body=n('div');d.append(body);async function update(){if(!d.open)return;try{const s=await api('whatsapp/status');if(!d.open)return;body.replaceChildren(n('p',s.status==='ready'?'WhatsApp conectado':s.message||s.status));if(s.qr){const img=n('img');img.src=s.qr;img.alt='QR Code para conectar WhatsApp';img.width=230;body.append(img);}body.append(b('Conectar',()=>api('whatsapp/connect',{})),b('Desconectar',async()=>{if(confirm('Desconectar o WhatsApp desta loja?'))await api('whatsapp/disconnect',{});}));}catch(e){body.textContent=e.message;}if(d.open)setTimeout(update,2500);}await update();}
 async function manageTeam(){team=await api('team');const d=modal('Equipe de atendimento',{conversation:false});for(const u of team.users){const row=n('div',undefined,'studio-team-row');row.append(n('strong',u.name),n('span',(u.active?'Ativo':'Inativo')+' · '+(u.presence?.online?'online':'offline')+' · '+u.role));if(team.me.role==='owner'&&u.role==='staff')row.append(b('Editar acesso',()=>staffForm(d,u)));d.append(row);}if(team.me.role==='owner')d.append(b('＋ Novo atendente',()=>staffForm(d)));}
 function staffForm(parent,u={}){const d=modal(u.id?'Editar acesso':'Novo atendente',{conversation:false}),form=n('form');for(const [name,label,type]of [['name','Nome','text'],['username','Usuário individual','text'],['password',u.id?'Nova senha (opcional)':'Senha (mínimo de 12 caracteres)','password']]){const l=n('label',label),input=n('input');input.name=name;input.type=type;input.value=u[name]||'';input.required=name!=='password'||!u.id;if(name==='password'){input.minLength=12;input.autocomplete='new-password';}l.append(input);form.append(l);}const active=n('input');active.type='checkbox';active.checked=u.active!==false;const label=n('label','Acesso ativo');label.append(active);form.append(label);const save=n('button','Salvar','button');form.append(save);form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{await api('team',{...Object.fromEntries(new FormData(form)),active:active.checked,version:u.version||0,...(u.id?{id:u.id}:{})});d.close();parent.close();await manageTeam();}catch(e){report(e.message);}finally{save.disabled=false;}};d.append(form);}
 async function refresh(force=false){
  if(!visible||!root)return;if(refreshing){refreshPending=true;return;}refreshing=true;const run=refreshGeneration,ticket=epoch;
  try{
   if(force||!team||tick%6===0){const next=await api('team');if(run!==refreshGeneration||!visible)return;team=next;const currentPresence=team.users.find(user=>user.id===team.me.id)?.presence;if(!presenceChanging&&currentPresence?.online)presence=currentPresence.status;}
   if(tick++%6===0)await api('attendance/presence',{status:presence});
   const result=await api('attendance/inbox');if(run!==refreshGeneration||!visible||!root)return;
   queue=result.chats;sources=result.sources;if(firstLoad){firstLoad=false;if(!queue.some(c=>c.desk.assignedUserId===team.me.id)&&queue.some(c=>!c.desk.assignedUserId))scope='unassigned';}
   if(result.truncated)report('Lista limitada às conversas recentes retornadas pelos canais.');channels();filters();renderList();
   if(selected&&ticket===epoch){const row=queue.find(c=>code(c)===code(selected));if(row&&row.desk.version!==desk.version){desk=row.desk;selected=row;head();compose();await customer(ticket);}await messages(ticket);if(tick%3===0&&!root.querySelector('.inbox-customer')?.contains(document.activeElement))await customer(ticket);}
  }catch(error){if(run===refreshGeneration&&visible)report(error.message);}
  finally{refreshing=false;clearTimeout(timer);if(run===refreshGeneration&&visible){if(refreshPending){refreshPending=false;timer=setTimeout(()=>refresh(),150);}else timer=setTimeout(()=>refresh(),5000);}else{refreshPending=false;if(visible&&root)timer=setTimeout(()=>refresh(),150);}}
 }

 async function openContact(phone,text=''){if(!root)build();const chat=await api('whatsapp/new-chat',{phone});const row={...chat,provider:'whatsapp',name:chat.name||phone,desk:chat.desk||{version:0,status:'new'}};if(!team)team=await api('team');await choose(row);if(text){const input=root.querySelector('.inbox-message-input');input.value=text;remember();}}
 window.addEventListener('resize',size);
 return {
  init(options){ctx=options;},
  show(value){
   if(visible===value){if(value)refresh();return;}
   visible=value;clearTimeout(timer);
   if(!value){refreshGeneration++;remember();stopRecording(true);closeConversationDialogs();return;}
   if(!root)build();window.scrollTo(0,0);requestAnimationFrame(size);refresh(true);
  },
  openContact,refresh,
  contextChanged(){
   if(!visible||!selected)return;
   const active=document.activeElement;if(root.querySelector('.inbox-customer')?.contains(active))return;
   customer().catch(error=>report(error.message));
  },
  reset(){
   visible=false;++epoch;++refreshGeneration;++customerSequence;clearTimeout(timer);drafts.clear();pendingSends.clear();customerDrafts.clear();
   stopRecording(true);for(const d of document.querySelectorAll('dialog[data-inbox-owned]'))d.close();resizeObserver?.disconnect();resizeObserver=null;
   team=null;selected=null;desk=null;context=null;queue=[];sources=[];tick=0;firstLoad=true;source='all';scope='mine';state='all';owner='';search='';internal=false;conversationQuery='';quoted=null;presence='available';presenceChanging=false;
   root?.remove();root=null;document.querySelector('#view-whatsapp')?.classList.remove('inbox-enabled');
  }
 };
})();
