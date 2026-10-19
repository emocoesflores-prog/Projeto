/* Identidade do canal: ícone e nome, para não depender somente da cor. */
window.ChannelIdentity=(()=>{
 const names={whatsapp:'WhatsApp',instagram:'Instagram',facebook:'Facebook',gmail:'Gmail',outlook:'Outlook',imap:'E-mail',email:'E-mail'};
 const paths={
  whatsapp:['M20.5 11.7a8.5 8.5 0 0 1-12.6 7.5L3 20.5l1.4-4.7A8.5 8.5 0 1 1 20.5 11.7Z','m8.3 7.4 1.2 2-1 1c.7 1.6 1.8 2.7 3.5 3.4l1-1 2 1.2c.1 1.6-1 2.3-2.3 1.9-3.7-1.1-6-3.5-6.4-6.1-.2-1 .8-2.2 2-2.4Z'],
  instagram:['M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z','M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z','M17.5 6.5h.01'],
  facebook:['M14 21v-8h3l.5-3H14V8.5c0-1 .3-1.5 1.6-1.5H18V4.2A24 24 0 0 0 15 4c-3 0-4 1.8-4 4.5V10H8v3h3v8'],
  gmail:['M3 19V6l9 7 9-7v13','M3 6l9 7 9-7'],
  outlook:['M10 6h11v14H10','m11 8 5 4 5-4','M3 4h10v16H3Z','M10 12c0 2-1 3-2 3s-2-1-2-3 1-3 2-3 2 1 2 3Z'],
  email:['M3 5h18v14H3Z','m3 5 9 7 9-7']
 };
 function icon(provider){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('channel-brand-icon');for(const d of paths[provider]||paths.email){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);svg.append(path);}return svg;}
 function apply(target,provider){if(!names[provider])provider='email';target.dataset.channelBrand=provider;target.classList.add('attendance-channel-badge');target.setAttribute('aria-label','Canal: '+names[provider]);const label=document.createElement('span');label.textContent=names[provider];target.replaceChildren(icon(provider),label);return target;}
 function badge(provider){return apply(document.createElement('span'),provider);}
 function control(target,provider){target.dataset.channelBrand=provider;target.querySelector('.channel-brand-icon')?.remove();target.prepend(icon(provider));}
 return {badge,apply,control};
})();
