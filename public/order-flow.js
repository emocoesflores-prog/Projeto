/* Uma única definição das etapas, compartilhada entre servidor e telas. */
(function(root){
 const ready=o=>o.fulfillment==='delivery'?'Pronto aguardando entregador':o.fulfillment==='pickup'?'Pronto aguardando retirada':'Pronto';
 function status(o){const s=o.status;if(o.fulfillment==='store'&&o.paymentStatus==='paid'&&s!=='Cancelado')return 'Concluído';if(s==='Recebido'&&o.paymentStatus==='paid')return 'Aguardando preparação';if(s==='Em preparação'&&!o.workshopStartedAt)return 'Aguardando preparação';if(s==='Pronto')return ready(o);if(s==='Esperando retirada')return 'Pronto aguardando retirada';if(['Retirado','Concluído na loja'].includes(s))return 'Concluído';return s;}
 const closed=o=>['Concluído','Cancelado'].includes(status(o));
 const fulfilled=o=>['Entregue','Concluído','Cancelado'].includes(status(o));
 function next(o){return {Recebido:'Aguardando preparação',Agendado:'Aguardando preparação','Aguardando preparação':'Em preparação','Em preparação':ready(o),'Pronto aguardando entregador':'Saiu para entrega','Pronto aguardando retirada':'Concluído',Pronto:'Concluído','Saiu para entrega':'Entregue',Entregue:'Concluído'}[status(o)]||null;}
 function stage(o){return {'Aguardando pagamento':'payment',Agendado:'scheduled',Recebido:'received','Aguardando preparação':'queue','Em preparação':'production','Pronto aguardando entregador':'ready','Pronto aguardando retirada':'pickup',Pronto:'ready','Saiu para entrega':'route',Entregue:'delivered',Concluído:'finished',Cancelado:'cancelled'}[status(o)]||'received';}
 const api={ready,status,next,closed,fulfilled,stage};if(typeof module==='object')module.exports=api;else root.OrderFlow=api;
})(globalThis);
