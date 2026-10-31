/* IDs do SQL Server e do JSON têm a mesma identidade, independente da caixa. */
(function(root){
 const key=id=>String(id||'').toLowerCase();
 function merge(previous,incoming){const map=new Map();for(const original of [...previous,...incoming]){if(!original?.id)continue;const id=key(original.id),old=map.get(id);if(!old||(original.version||0)>=(old.version||0))map.set(id,{...original,id});}return [...map.values()];}
 function compare(a,b){const rank=o=>['Concluído','Retirado','Concluído na loja'].includes(o.status)?2:o.status==='Cancelado'?1:0,group=rank(a)-rank(b);if(group)return group;if(rank(a)>0)return (Date.parse(b.completedAt||b.createdAt)||0)-(Date.parse(a.completedAt||a.createdAt)||0)||key(a.id).localeCompare(key(b.id));return String(a.date||'').localeCompare(String(b.date||''))||String(a.timeSlot||a.period||'').localeCompare(String(b.timeSlot||b.period||''))||(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0)||key(a.id).localeCompare(key(b.id));}
 const api={key,merge,compare};if(typeof module==='object')module.exports=api;else root.OrderCollection=api;
})(globalThis);
