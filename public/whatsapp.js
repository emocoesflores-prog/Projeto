const WhatsAppDesk = (() => {
  let config, timer, visible=false, selected=null, epoch=0, polling=false, ready=false, sending=false, allChats=[], filter='all', suggestionId=null, aiConfigured=false, generating=false, lastMessages='';
  const drafts=new Map(), el=id=>document.getElementById(id);
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const initials=name=>name.split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
  const date=t=>t?new Date(t*1000).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}):'';
  async function request(path,options={}) {
    const binary=options.body instanceof Blob;
    const r=await fetch('/api/admin/whatsapp'+path,{...options,headers:{...config.auth(),'Content-Type':binary?'application/octet-stream':'application/json'},cache:'no-store',signal:AbortSignal.timeout(path.endsWith('/suggestion')?30000:20000)});
    if(!r.ok){let data;try{data=await r.json();}catch{data={error:'O servidor não respondeu como esperado.'};}throw Error((data.error||'Falha na conexão.')+(data.code?' ['+data.code+(data.diagnostic?': '+data.diagnostic:'')+']':''));}
    return options.download?r:await r.json();
  }
  function enabled(value){
    ready=value;const available=!!selected&&ready&&!sending;
    for(const id of ['wa-body','wa-submit','wa-attach','wa-templates','wa-favorite','wa-stage','wa-owner','wa-notes','wa-save-notes','wa-order','wa-create-order','wa-ai-enabled'])el(id).disabled=!available;
    el('wa-generate').disabled=generating||!available||!selected?.desk?.aiEnabled||!aiConfigured;
    el('wa-new').disabled=!ready;el('wa-connect').disabled=ready;
  }
  function renderQueue(){
    const query=el('wa-search').value.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
    const list=allChats.filter(c=>{
      const match=(c.name+' '+c.id+' '+(c.preview||'')).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().includes(query);
      return match&&(filter==='all'||filter==='unread'&&c.unread>0||filter==='favorite'&&c.desk?.favorite||filter==='open'&&c.desk?.status==='open'||filter==='done'&&c.desk?.status==='done');
    });
    el('wa-total').textContent=allChats.length;el('wa-unread').textContent=allChats.filter(c=>c.unread>0).length;el('wa-open').textContent=allChats.filter(c=>c.desk?.status==='open').length;el('wa-done').textContent=allChats.filter(c=>c.desk?.status==='done').length;
    el('wa-chats').replaceChildren();
    for(const c of list){const button=node('button',undefined,'wa-chat-row'+(selected?.id===c.id?' selected':''));button.type='button';button.setAttribute('aria-pressed',String(selected?.id===c.id));const text=node('div',undefined,'wa-chat-text'),line=node('div',undefined,'wa-chat-line');line.append(node('strong',(c.desk?.favorite?'★ ':'')+(c.name||c.id.split('@')[0])),node('time',date(c.timestamp)));const bottom=node('div',undefined,'wa-chat-line');bottom.append(node('span',c.preview||'Abrir conversa','wa-preview'));if(c.unread)bottom.append(node('span',c.unread,'wa-unread-badge'));text.append(line,bottom);button.append(node('span',initials(c.name||'?'),'wa-avatar'),text);button.onclick=()=>selectChat(c);el('wa-chats').append(button);}
    if(!list.length)el('wa-chats').append(node('div',query||filter!=='all'?'Nenhuma conversa corresponde ao filtro.':ready?'Nenhuma conversa individual carregada.':'Conecte o WhatsApp para carregar sua fila.','wa-empty'));
  }
  function renderContext(){
    if(!selected)return;const c=selected,d=c.desk||{};
    el('wa-title').textContent=c.name||c.id.split('@')[0];el('wa-phone').textContent=c.id.endsWith('@lid')?'Contato WhatsApp · identificador privado':c.id.split('@')[0];el('wa-avatar').textContent=initials(c.name||'?');el('wa-contact-avatar').textContent=initials(c.name||'?');el('wa-contact-name').textContent=c.name||'Contato';el('wa-contact-phone').textContent=el('wa-phone').textContent;
    el('wa-stage').value=d.status||'new';el('wa-favorite').textContent=d.favorite?'★':'☆';el('wa-favorite').setAttribute('aria-pressed',String(!!d.favorite));el('wa-owner').value=d.assignedTo||'';el('wa-notes').value=d.notes||'';el('wa-ai-enabled').checked=!!d.aiEnabled;
    el('wa-ai-status').textContent=!aiConfigured?'A Florzinha precisa de uma chave de API configurada no servidor.':d.aiEnabled?'Habilitada nesta conversa. Clique em Sugerir com Florzinha.':'Habilite para receber sugestões nesta conversa.';
    const order=el('wa-order');order.replaceChildren(node('option','Sem pedido vinculado'));order.firstChild.value='';for(const o of config.getOrders?.()||[]){const option=node('option',(o.customer||'Cliente')+' · '+o.id.slice(0,8));option.value=o.id;order.append(option);}if(d.orderId&&!Array.from(order.options).some(o=>o.value===d.orderId)){const o=node('option','Pedido vinculado · '+d.orderId.slice(0,8));o.value=d.orderId;order.append(o);}order.value=d.orderId||'';el('wa-open-order').hidden=!(config.getOrders?.()||[]).some(o=>o.id===d.orderId);
    const names={status:'Etapa alterada',favorite:'Favorito atualizado',assignedTo:'Responsável atualizado',notes:'Notas internas atualizadas',orderId:'Pedido vinculado atualizado',aiEnabled:'Florzinha atualizada'};el('wa-timeline').replaceChildren();for(const h of (d.history||[]).slice(-8).reverse()){const item=node('div',(h.fields||[]).map(f=>names[f]||'Atendimento atualizado').join(' · '),'wa-timeline-item');item.append(node('small',new Date(h.at).toLocaleString('pt-BR')));el('wa-timeline').append(item);}if(!d.history?.length)el('wa-timeline').append(node('p','Sem alterações registradas.','small'));enabled(ready);
  }
  async function patchDesk(patch){
    if(!selected)return;const id=selected.id,version=epoch;const unsaved={owner:el('wa-owner').value,notes:el('wa-notes').value};
    const data=await request('/chats/'+encodeURIComponent(id)+'/desk',{method:'PATCH',body:JSON.stringify(patch)});
    const chat=allChats.find(c=>c.id===id);if(chat)chat.desk=data;
    if(version===epoch&&selected?.id===id){selected.desk=data;renderContext();if(!('notes' in patch))el('wa-notes').value=unsaved.notes;if(!('assignedTo' in patch))el('wa-owner').value=unsaved.owner;renderQueue();}
  }
  async function selectChat(chat){
    if(selected)drafts.set(selected.id,el('wa-body').value);
    selected=chat;lastMessages='';el('wa-body').value=drafts.get(chat.id)||'';el('wa-result').textContent='';el('wa-suggestion').hidden=true;suggestionId=null;
    renderQueue();renderContext();el('wa-messages').replaceChildren(node('div','Carregando mensagens…','wa-empty'));
    try{await messages();}catch(e){if(selected?.id===chat.id)el('wa-result').textContent=e.message;}
  }
  async function download(id,message){
    try{const r=await request('/chats/'+encodeURIComponent(id)+'/messages/'+encodeURIComponent(message.id)+'/media',{download:true});const blob=await r.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;const name=r.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1];a.download=name||'anexo';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){if(selected?.id===id)el('wa-result').textContent=e.message;}
  }
  async function messages(version=epoch){
    if(!selected)return;const id=selected.id;
    const list=await request('/chats/'+encodeURIComponent(id)+'/messages');if(version!==epoch||selected?.id!==id)return;
    const digest=JSON.stringify(list);if(digest===lastMessages)return;const first=!lastMessages;lastMessages=digest;
    const box=el('wa-messages'),scroll=box.scrollTop,nearBottom=box.scrollHeight-box.clientHeight-scroll<90;box.replaceChildren();let day='';
    for(const m of list){const currentDay=new Date(m.timestamp*1000).toLocaleDateString('pt-BR');if(currentDay!==day){box.append(node('span',currentDay,'wa-day'));day=currentDay;}const bubble=node('article',undefined,'wa-bubble'+(m.fromMe?' mine':''));bubble.append(node('p',m.body||(m.hasMedia?'Anexo recebido':'[Mensagem sem texto]')));if(m.hasMedia){const button=node('button','↓ Baixar anexo','text-button');button.type='button';button.onclick=()=>download(id,m);bubble.append(button);}const ack=m.fromMe?(m.ack>=3?' · Lida':m.ack>=2?' · Entregue':m.ack<0?' · Falha':' · Enviada'):'';bubble.append(node('small',new Date(m.timestamp*1000).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+ack));box.append(bubble);}
    if(!list.length)box.append(node('div','Nenhuma mensagem disponível. Você pode iniciar o atendimento abaixo.','wa-empty'));
    box.scrollTop=first||nearBottom?box.scrollHeight:scroll;
  }
  async function chats(version=epoch){
    const list=await request('/chats');if(version!==epoch)return;
    allChats=list;if(selected){const refreshed=list.find(c=>c.id===selected.id);if(refreshed){selected={...refreshed};}else allChats.unshift(selected);}
    el('wa-chat-status').textContent='';renderQueue();
  }
  async function poll(){
    if(!visible||polling)return;polling=true;const version=epoch;
    try{const s=await request('/status');if(version!==epoch)return;aiConfigured=!!s.aiConfigured;
      const labels={disconnected:'WhatsApp desconectado',starting:'Iniciando conexão…',qr:'Escaneie o QR Code',authenticated:'Autenticado · sincronizando…',ready:'● WhatsApp conectado',error:'Falha na conexão'};
      el('wa-status').textContent=s.error||labels[s.status]||s.status;el('wa-qr').hidden=!s.qr;if(s.qr){el('wa-qr').src=s.qr;el('wa-connection').hidden=false;}else el('wa-qr').removeAttribute('src');enabled(s.status==='ready');
      if(ready){try{await chats(version);}catch(e){if(version===epoch)el('wa-chat-status').textContent=e.message;}try{await messages(version);}catch(e){if(version===epoch)el('wa-result').textContent=e.message;}}
      else if(!selected)renderQueue();
    }catch(e){if(version===epoch){el('wa-status').textContent=e.name==='TimeoutError'?'O servidor demorou para responder.':e.message;enabled(false);}}
    finally{polling=false;if(visible)timer=setTimeout(poll,4000);}
  }
  async function send(file){
    if(!selected||!ready||sending)return;const id=selected.id,version=epoch,body=el('wa-body').value.trim();
    if(!file&&!body)return;
    if(file&&file.size>8*1024*1024){el('wa-result').textContent='O arquivo deve ter no máximo 8 MB.';return;}
    sending=true;enabled(ready);el('wa-result').textContent=file?'Enviando anexo…':'Enviando mensagem…';
    try{
      await request('/chats/'+encodeURIComponent(id)+(file?'/media?'+new URLSearchParams({mime:file.type,filename:file.name}):'/messages'),{method:'POST',body:file||JSON.stringify({body})});
      if(version!==epoch||selected?.id!==id)return;
      if(!file&&el('wa-body').value.trim()===body){el('wa-body').value='';drafts.delete(id);}el('wa-result').textContent='Enviado ao WhatsApp.';
      try{await messages(version);await chats(version);}catch{el('wa-result').textContent='Enviado. A atualização do histórico falhou; confira no celular antes de reenviar.';}
    }catch(e){if(version===epoch&&selected?.id===id)el('wa-result').textContent=e.message+' Confira no celular antes de reenviar.';}
    finally{sending=false;el('wa-file').value='';enabled(ready);}
  }
  return {
    init(options){config=options;
      el('wa-connection-toggle').onclick=()=>{el('wa-connection').hidden=!el('wa-connection').hidden;};
      for(const action of ['connect','disconnect'])el('wa-'+action).onclick=async()=>{if(action==='disconnect'&&!confirm('Desconectar este aparelho do WhatsApp?'))return;el('wa-status').textContent=action==='connect'?'Iniciando WhatsApp…':'Desconectando…';const button=el('wa-'+action);button.disabled=true;try{await request('/'+action,{method:'POST',body:'{}'});if(action==='disconnect'){selected=null;allChats=[];drafts.clear();lastMessages='';renderQueue();el('wa-messages').replaceChildren();el('wa-body').value='';enabled(false);}clearTimeout(timer);await poll();}catch(e){el('wa-status').textContent=e.message;}finally{button.disabled=action==='connect'&&ready;}};
      el('wa-refresh').onclick=async()=>{try{await chats();await messages();}catch(e){el('wa-chat-status').textContent=e.message;}};
      el('wa-search').oninput=renderQueue;
      for(const button of el('wa-filters').querySelectorAll('button'))button.onclick=()=>{filter=button.dataset.filter;for(const b of el('wa-filters').querySelectorAll('button'))b.classList.toggle('active',b===button);renderQueue();};
      el('wa-send').onsubmit=e=>{e.preventDefault();send();};el('wa-body').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send();}};
      el('wa-attach').onclick=()=>el('wa-file').click();el('wa-file').onchange=()=>{const file=el('wa-file').files[0];if(file&&confirm('Enviar o arquivo “'+file.name+'” para '+selected?.name+'?'))send(file);else el('wa-file').value='';};
      const save=async patch=>{try{await patchDesk(patch);el('wa-result').textContent='Atendimento atualizado.';}catch(e){el('wa-result').textContent=e.message;renderContext();}};
      el('wa-stage').onchange=()=>save({status:el('wa-stage').value});el('wa-favorite').onclick=()=>save({favorite:!selected?.desk?.favorite});el('wa-save-notes').onclick=()=>save({assignedTo:el('wa-owner').value,notes:el('wa-notes').value});el('wa-ai-enabled').onchange=()=>save({aiEnabled:el('wa-ai-enabled').checked});el('wa-order').onchange=()=>save({orderId:el('wa-order').value});el('wa-open-order').onclick=()=>config.openOrder?.(selected?.desk?.orderId);el('wa-create-order').onclick=()=>config.createOrder?.();
      const templates=[['Boas-vindas','Olá! Seja bem-vindo(a) à Emoções Flores 🌸 Como posso ajudar você a presentear hoje?'],['Entender o pedido','Para qual ocasião você procura o presente? Tem alguma preferência de flores ou faixa de valor?'],['Entrega','Podemos conferir a entrega para você. Qual é a cidade, o endereço e a data desejada?'],['Retirada','Nossa retirada é na Rua Havana, 95, Parque das Américas, Mauá. Para qual dia você precisa?'],['Agradecimento','Obrigada por escolher a Emoções Flores! 🌸 Se precisar de algo mais, estou por aqui.']];
      for(const [title,body]of templates){const b=node('button',undefined,'wa-template');b.type='button';b.append(node('strong',title),node('span',body));b.onclick=()=>{el('wa-body').value=body;el('wa-template-dialog').close();el('wa-body').focus();};el('wa-template-list').append(b);}el('wa-templates').onclick=()=>el('wa-template-dialog').showModal();el('wa-close-templates').onclick=()=>el('wa-template-dialog').close();
      el('wa-generate').onclick=async()=>{if(!selected||generating)return;generating=true;const id=selected.id,version=epoch;el('wa-generate').disabled=true;el('wa-result').textContent='Florzinha está preparando uma sugestão…';try{const data=await request('/chats/'+encodeURIComponent(id)+'/suggestion',{method:'POST',body:'{}'});if(version===epoch&&selected?.id===id){suggestionId=id;el('wa-suggestion-text').textContent=data.text;el('wa-suggestion').hidden=false;el('wa-result').textContent='Sugestão pronta. Revise antes de enviar.';}}catch(e){if(version===epoch&&selected?.id===id)el('wa-result').textContent=e.message;}finally{generating=false;enabled(ready);}};
      el('wa-use-ai').onclick=()=>{if(suggestionId===selected?.id){el('wa-body').value=el('wa-suggestion-text').textContent;el('wa-suggestion').hidden=true;el('wa-body').focus();}};el('wa-dismiss-ai').onclick=()=>{el('wa-suggestion').hidden=true;suggestionId=null;};
      el('wa-new').onclick=()=>{el('wa-new-result').textContent='';el('wa-new-dialog').showModal();};el('wa-close-new').onclick=()=>el('wa-new-dialog').close();el('wa-new-form').onsubmit=async e=>{e.preventDefault();const button=e.currentTarget.querySelector('button');button.disabled=true;try{const chat=await request('/new-chat',{method:'POST',body:JSON.stringify({phone:el('wa-new-phone').value})});const existing=allChats.find(c=>c.id===chat.id);if(!existing)allChats.unshift(chat);await selectChat(existing||chat);el('wa-new-dialog').close();}catch(error){el('wa-new-result').textContent=error.message;}finally{button.disabled=false;}};enabled(false);
    },
    setVisible(value){if(visible===value)return;visible=value;++epoch;clearTimeout(timer);if(value){el('wa-status').textContent='Consultando conexão…';poll();}},
    logout(){visible=false;++epoch;clearTimeout(timer);selected=null;ready=false;allChats=[];drafts.clear();lastMessages='';suggestionId=null;el('wa-suggestion').hidden=true;el('wa-suggestion-text').textContent='';el('wa-qr').hidden=true;el('wa-qr').removeAttribute('src');el('wa-chats').replaceChildren();el('wa-messages').replaceChildren();for(const id of ['wa-body','wa-owner','wa-notes'])el(id).value='';el('wa-result').textContent='';el('wa-chat-status').textContent='';el('wa-title').textContent='Selecione uma conversa';el('wa-contact-name').textContent='Informações do contato';el('wa-contact-phone').textContent='';el('wa-phone').textContent='';el('wa-timeline').replaceChildren();enabled(false);for(const id of ['wa-template-dialog','wa-new-dialog'])if(el(id).open)el(id).close();}
  };
})();
