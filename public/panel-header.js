/* Navegação e conexão comuns a todos os módulos, inclusive o PDV. */
window.PanelHeader=(()=>{
 let healthy=false;
 function connection(node,online){
  const text=online?'ONLINE':'OFFLINE';
  if(node.textContent!==text)node.textContent=text;
  if(node.dataset.online!==String(online))node.dataset.online=String(online);
  node.setAttribute('aria-label',online?'Sistema online e conectado':'Sistema offline ou sem conexão');
 }
 function sync(){
  const main=document.querySelector('.dashboard-shell>.dashboard-topbar'),pdv=document.querySelector('#pdv .dashboard-topbar');
  const source=document.querySelector('#mode-badge');if(source&&!source.hidden)source.hidden=true;
  if(pdv){
   const mode=pdv.querySelector('[data-header-mode]');if(mode&&!mode.hidden)mode.hidden=true;
   const link=pdv.querySelector('[data-header-store]'),original=document.querySelector('#hub-store-link');
   if(link&&original&&link.href!==original.href)link.href=original.href;
   const avatar=pdv.querySelector('.avatar'),other=main?.querySelector('.avatar');
   if(avatar&&other&&avatar.textContent!==other.textContent){avatar.textContent=other.textContent;avatar.setAttribute('aria-label',other.getAttribute('aria-label')||'Usuário');}
  }
  for(const e of document.querySelectorAll('[data-header-live]'))connection(e,navigator.onLine&&healthy&&(!window.OrderLive||OrderLive.online));
 }
 function init(){
  const main=document.querySelector('.dashboard-shell>.dashboard-topbar'),start=main?.querySelector('.hub-header-start');
  if(start&&!start.querySelector('.panel-brand-icon')){const logo=document.createElement('span');logo.className='panel-brand-icon';logo.textContent='✿';logo.setAttribute('aria-hidden','true');start.insertBefore(logo,start.querySelector('.hub-header-label'));}
  if(!window.ModuleHub&&start){const back=document.createElement('button');back.type='button';back.className='secondary hub-back';back.append(UIIcons.label('back','Voltar'));back.onclick=()=>{if(!document.querySelector('#view-finance')?.hidden)document.querySelector('[data-inova-tab=platform]')?.click();else location.assign('/admin.html');};start.prepend(back);}
  for(const bar of document.querySelectorAll('.dashboard-topbar')){
   const actions=bar.querySelector('.hub-header-actions');if(!actions)continue;
   let live=actions.querySelector('[data-header-live]');
   if(!live){live=document.createElement('span');live.className='live-connection';live.dataset.headerLive='';live.setAttribute('role','status');if(bar===main)live.id='order-live-status';actions.prepend(live);}
   connection(live,false);
   const home=document.createElement(window.ModuleHub?'button':'a');home.className='header-module-home';home.append(UIIcons.label('grid','Central de Módulos'));
   if(window.ModuleHub){home.type='button';home.onclick=()=>ModuleHub.home();}else home.href='/admin.html';
   actions.prepend(home);
  }
  const pdv=document.querySelector('#pdv .dashboard-topbar');
  if(pdv){pdv.querySelector('[data-header-refresh]').onclick=()=>document.querySelector('#refresh').click();pdv.querySelector('[data-header-logout]').onclick=async()=>{if(await FloristPOS.suspend())document.querySelector('#logout').click();};}
  // Observe only source data. Writing a badge must never trigger its own observer.
  const original=document.querySelector('#hub-store-link'),avatar=main?.querySelector('.avatar');
  if(original)new MutationObserver(sync).observe(original,{attributes:true,attributeFilter:['href']});
  if(avatar)new MutationObserver(sync).observe(avatar,{childList:true,characterData:true,subtree:true});
  document.addEventListener('order-live-state',sync);window.addEventListener('offline',sync);window.addEventListener('online',sync);sync();
  let checking=false;const check=async()=>{if(checking)return;checking=true;try{const r=await fetch('/api/health',{cache:'no-store',signal:AbortSignal.timeout(7000)});healthy=r.ok;}catch{healthy=false;}finally{checking=false;sync();}};
  check();setInterval(check,15000);window.addEventListener('online',check);window.addEventListener('focus',check);

 }
 document.addEventListener('DOMContentLoaded',init);return {sync};
})();
