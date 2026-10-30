const model=require('./public/workshop-model'),{applyMutation,OrderError}=require('./order-domain');
function printerGate(printers,proof,now=new Date()){
 if(!printers?.length)return 'Cadastre ao menos uma impressora em Impressões para ativar o preparo automático.';
 if(!proof?.supported)return 'A verificação das impressoras exige o sistema em execução no Windows com acesso às filas cadastradas.';
 const at=Date.parse(proof.checkedAt);if(!Number.isFinite(at)||+now-at>15000||at>+now+1000)return 'Não foi possível confirmar o estado atual das impressoras.';
 for(const p of printers){const found=proof.printers?.find(r=>r.systemName===p.systemName);if(!found?.ready)return 'Preparo automático pausado: '+p.name+' — '+(found?.reason||'impressora indisponível ou não encontrada')+'.';}return null;
}
function release(order,preferences,now=new Date()){if(!model.due(order,preferences,now))return null;const next=applyMutation(order,{action:'status',version:order.version,status:'Em preparação'}),w=model.windowOf(order);next.updatedAt=now.toISOString();next.workshopRelease={mode:'automatic',at:now.toISOString(),scheduledStart:w.start.toISOString(),leadMinutes:preferences.preparationLeadMinutes};const h=next.history.at(-1);h.at=now.toISOString();h.actor='Sistema · ODF automática';h.description='Encaminhado automaticamente à Oficina '+preferences.preparationLeadMinutes+' minuto(s) antes do início do período. Impressoras disponíveis na verificação.';return next;}
module.exports={...model,printerGate,release};
