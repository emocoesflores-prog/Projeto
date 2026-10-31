const model=require('./public/workshop-model'),{applyMutation,OrderError}=require('./order-domain');
function printerGate(printers,proof,now=new Date()){
 if(!printers?.length)return null;
 if(!proof?.supported)return 'A verificação das impressoras exige o sistema em execução no Windows com acesso às filas cadastradas.';
 const at=Date.parse(proof.checkedAt);if(!Number.isFinite(at)||+now-at>15000||at>+now+1000)return 'Não foi possível confirmar o estado atual das impressoras.';
 for(const p of printers){const found=proof.printers?.find(r=>r.systemName===p.systemName);if(!found?.ready)return 'Preparo automático pausado: '+p.name+' — '+(found?.reason||'impressora indisponível ou não encontrada')+'.';}return null;
}
function release(order,preferences,now=new Date()){if(!model.due(order,preferences,now))return null;const next=applyMutation(order,{action:'status',version:order.version,status:'Aguardando preparação'}),w=model.windowOf(order);next.updatedAt=now.toISOString();next.workshopRelease={mode:'automatic',at:now.toISOString(),scheduledStart:w.start.toISOString(),leadMinutes:preferences.preparationLeadMinutes};const h=next.history.at(-1);h.at=now.toISOString();h.actor='Sistema · ODF automática';h.description='Encaminhado automaticamente à Oficina '+preferences.preparationLeadMinutes+' minuto(s) antes do início do período. Preferências da Oficina e verificações operacionais atendidas.';return next;}
function withImages(orders,tenant){
 const products=new Map((tenant.profile.catalog||require('./catalog')).map(p=>[p.id,p]));
 const valid=url=>typeof url==='string'&&url&&require('./product-domain').validMedia(url,tenant);
 return orders.map(order=>({...order,items:order.items.map(item=>{
  const product=products.get(item.id),current=product?.images?.[0]||product?.image||'';
  return {...item,image:valid(item.image)?item.image:valid(current)?current:''};
 })}));
}
module.exports={...model,printerGate,release,withImages};
