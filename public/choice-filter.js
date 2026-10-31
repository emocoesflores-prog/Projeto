/* Filtro reutilizável: escolhas em edição só passam a valer ao aplicar. */
(function(root){
 function normalize(ids,allowed,all='all'){const values=[...new Set(ids)].filter(id=>allowed.includes(id));return values.includes(all)||!values.length?[all]:values;}
 function toggle(ids,id,checked,all='all'){if(id===all)return checked?[all]:[];const next=new Set(ids.filter(v=>v!==all));if(checked)next.add(id);else next.delete(id);return [...next];}
 function create({host,label='Filtrar por status',options,selected=['all'],all='all',multiple=true,onApply=()=>{},compact=false}){
  const n=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
  const events=new AbortController(),id='choice-'+crypto.randomUUID(),allowed=options.map(o=>o.id);let applied=normalize(selected,allowed,all),draft=[...applied],open=false;
  host.classList.add('choice-filter');const trigger=n('button',undefined,'choice-filter-trigger');trigger.type='button';trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls',id);
  const copy=n('span',undefined,'choice-filter-copy'),caption=n('strong',label),value=n('span');copy.append(caption,value);trigger.append(UIIcons.icon('filter'),copy,UIIcons.icon('chevronDown'));if(compact)trigger.classList.add('choice-filter-compact');host.append(trigger);
  const panel=n('div',undefined,'choice-filter-panel');panel.id=id;panel.popover='auto';panel.setAttribute('role','dialog');panel.setAttribute('aria-label',label);
  const list=n('div',undefined,'choice-filter-options'),footer=n('div',undefined,'choice-filter-footer'),hint=n('span','', 'choice-filter-hint');hint.setAttribute('role','status');
  const clear=n('button','Limpar','secondary'),apply=n('button','Aplicar filtro','button');clear.type=apply.type='button';footer.append(clear,apply);panel.append(list,hint,footer);document.body.append(panel);
  const rows=new Map();
  for(const option of options){const row=n('label',undefined,'choice-option '+(option.className||'')),input=n('input'),tile=n('span',undefined,'choice-option-tile'),text=n('span',undefined,'choice-option-text');input.type=multiple?'checkbox':'radio';input.name=id;input.value=option.id;input.dataset.choiceId=option.id;tile.append(UIIcons.icon(option.icon||'filter'));text.append(n('strong',option.label));const count=n('span',option.count===undefined?'':String(option.count),'choice-option-count');count.hidden=option.count===undefined;text.append(count);tile.append(text);row.append(input,tile);list.append(row);rows.set(option.id,{input,row,count});input.onchange=()=>{draft=multiple?toggle(draft,option.id,input.checked,all):[option.id];drawChecks();};}
  function drawChecks(){for(const [key,{input,row}]of rows){input.checked=draft.includes(key);row.classList.toggle('is-checked',input.checked);}apply.disabled=!draft.length;hint.hidden=!!draft.length;hint.textContent=draft.length?'':'Selecione pelo menos uma opção.';}
  function drawTrigger(){const chosen=options.filter(o=>applied.includes(o.id));value.textContent=applied.includes(all)?(chosen[0]?.label||'Todos')+(chosen[0]?.count!==undefined?' ('+chosen[0].count+')':''):chosen.length===1?chosen[0].label+(chosen[0].count!==undefined?' ('+chosen[0].count+')':''):chosen.length+' status selecionados';trigger.setAttribute('aria-label',label+': '+value.textContent);}
  function place(){const r=trigger.getBoundingClientRect(),anchor=host.closest('.orders-sidebar-head')?.getBoundingClientRect()||r,width=Math.min(480,Math.max(300,anchor.width-12),innerWidth-24),left=Math.max(12,Math.min(anchor.left+6,innerWidth-width-12));panel.style.width=width+'px';panel.style.left=left+'px';panel.style.top=Math.max(12,Math.min(r.bottom+7,innerHeight-160))+'px';panel.style.maxHeight=Math.max(140,innerHeight-parseFloat(panel.style.top)-12)+'px';}
  function hide(){if(panel.matches(':popover-open'))panel.hidePopover();}
  trigger.onclick=()=>{if(open)return hide();draft=[...applied];drawChecks();place();panel.showPopover();requestAnimationFrame(()=>rows.get(draft[0])?.input.focus());};
  panel.addEventListener('beforetoggle',e=>{open=e.newState==='open';trigger.setAttribute('aria-expanded',String(open));trigger.classList.toggle('is-open',open);});
  panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();hide();trigger.focus();}});
  clear.onclick=()=>{draft=[all];drawChecks();rows.get(all)?.input.focus();};
  apply.onclick=()=>{applied=normalize(draft,allowed,all);drawTrigger();hide();trigger.focus();onApply([...applied]);};
  window.addEventListener('resize',()=>{if(open)place();},{signal:events.signal});
  document.addEventListener('scroll',e=>{if(open&&!panel.contains(e.target))hide();},{capture:true,signal:events.signal});
  const observer=new MutationObserver(()=>{if(!host.isConnected){hide();panel.remove();events.abort();observer.disconnect();}else if(host.closest('[hidden]'))hide();});observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','data-module']});
  drawTrigger();return {set(ids){applied=normalize(ids,allowed,all);drawTrigger();if(!open){draft=[...applied];drawChecks();}},counts(values){for(const option of options){if(values[option.id]!==undefined){option.count=values[option.id];const row=rows.get(option.id);row.count.hidden=false;row.count.textContent=option.count;}}drawTrigger();},close:hide,get selected(){return [...applied];},get editing(){return [...draft];}};
 }
 const api={normalize,toggle,create};if(typeof module==='object')module.exports=api;else root.ChoiceFilter=api;
})(globalThis);
