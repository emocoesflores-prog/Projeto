const WhatsAppDesk = (() => {
  let auth, timer, visible=false, selected=null, epoch=0, polling=false, ready=false, sending=false;
  const el=id=>document.getElementById(id);
  const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
  async function request(path,options={}) {
    const r=await fetch('/api/admin/whatsapp'+path,{...options,headers:{...auth(),'Content-Type':'application/json'},cache:'no-store'});
    const data=await r.json();if(!r.ok)throw Error(data.error||'Falha na conexão.');return data;
  }
  function enabled(value){ready=value;el('wa-body').disabled=!value||!selected;el('wa-submit').disabled=!value||!selected||sending;}
  async function messages(version=epoch) {
    if(!selected)return;const id=selected.id;
    const list=await request('/chats/'+encodeURIComponent(id)+'/messages');
    if(version!==epoch||selected?.id!==id)return;
    const container=el('wa-messages');container.replaceChildren();
    for(const m of list){const box=node('article','');box.className=m.fromMe?'wa-message wa-mine':'wa-message';box.append(node('small',(m.fromMe?'Você':'Cliente')+' · '+new Date(m.timestamp*1000).toLocaleString('pt-BR')),node('p',m.body||(m.hasMedia?'[Anexo — abra no celular]':'[Mensagem sem texto]')));container.append(box);}
    if(!list.length)container.append(node('p','Nenhuma mensagem disponível.'));
  }
  async function chats(version=epoch){
    const list=await request('/chats');if(version!==epoch)return;
    el('wa-chats').replaceChildren();for(const c of list){const b=node('button',(c.name||c.id.split('@')[0])+(c.unread?' · '+c.unread+' nova(s)':''));b.type='button';b.className='wa-chat secondary';b.onclick=async()=>{if(selected?.id!==c.id)el('wa-body').value='';selected=c;el('wa-title').textContent=c.name||c.id.split('@')[0];el('wa-result').textContent='';enabled(ready);try{await messages();}catch(e){el('wa-result').textContent=e.message;}};el('wa-chats').append(b);}if(!list.length)el('wa-chats').append(node('p','Nenhuma conversa individual disponível.'));
  }
  async function poll(){
    if(!visible||polling)return;polling=true;const version=epoch;
    try{const s=await request('/status');if(version!==epoch)return;const labels={disconnected:'Desconectado',starting:'Iniciando conexão…',qr:'Escaneie o QR Code com seu celular.',authenticated:'Autenticado. Carregando conversas…',ready:'WhatsApp conectado',error:'Falha na conexão'};el('wa-status').textContent=s.error||labels[s.status]||s.status;el('wa-qr').hidden=!s.qr;if(s.qr)el('wa-qr').src=s.qr;else el('wa-qr').removeAttribute('src');enabled(s.status==='ready');if(ready){await chats(version);await messages(version);}else{selected=null;el('wa-chats').replaceChildren();el('wa-messages').replaceChildren();el('wa-title').textContent='Selecione uma conversa';}}
    catch(e){if(version===epoch){el('wa-status').textContent=e.message;enabled(false);}}
    finally{polling=false;if(visible)timer=setTimeout(poll,5000);}
  }
  return {
    init(options){auth=options.auth;
      for(const action of ['connect','disconnect'])el('wa-'+action).onclick=async()=>{if(action==='disconnect'&&!confirm('Desconectar este aparelho do WhatsApp?'))return;const b=el('wa-'+action);b.disabled=true;try{await request('/'+action,{method:'POST',body:'{}'});clearTimeout(timer);await poll();}catch(e){el('wa-status').textContent=e.message;}finally{b.disabled=false;}};
      el('wa-refresh').onclick=async()=>{try{await chats();await messages();}catch(e){el('wa-status').textContent=e.message;}};
      el('wa-send').onsubmit=async event=>{event.preventDefault();if(!selected||!ready||sending)return;const version=epoch;const id=selected.id,body=el('wa-body').value;sending=true;el('wa-submit').disabled=true;el('wa-result').textContent='Enviando…';try{await request('/chats/'+encodeURIComponent(id)+'/messages',{method:'POST',body:JSON.stringify({body})});if(version===epoch&&selected?.id===id){el('wa-body').value='';el('wa-result').textContent='Mensagem enviada ao WhatsApp.';await messages();}}catch(e){if(version===epoch)el('wa-result').textContent=e.message+' Confira a conversa no celular antes de reenviar.';}finally{sending=false;enabled(ready);}};
    },
    setVisible(value){if(visible===value)return;visible=value;++epoch;clearTimeout(timer);if(value)poll();},
    logout(){visible=false;++epoch;clearTimeout(timer);selected=null;enabled(false);el('wa-qr').hidden=true;el('wa-qr').removeAttribute('src');el('wa-chats').replaceChildren();el('wa-messages').replaceChildren();el('wa-body').value='';el('wa-result').textContent='';}
  };
})();
