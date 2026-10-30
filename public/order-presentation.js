(function(root){
 const statuses={'Aguardando pagamento':'payment',Agendado:'scheduled',Recebido:'received','Em preparação':'production',Pronto:'ready','Saiu para entrega':'route','Esperando retirada':'pickup',Entregue:'finished',Retirado:'finished','Concluído na loja':'finished',Cancelado:'cancelled'};
 const channels={site:'Site',manual:'Painel',pdv:'PDV',whatsapp:'WhatsApp',instagram:'Instagram',facebook:'Facebook',gmail:'Gmail',outlook:'Outlook',imap:'E-mail',email:'E-mail'};
 function channel(order){const key=order.salesChannel|| (order.source==='site'?'site':null);return {key:channels[key]?key:'legacy',label:channels[key]||'Painel · canal não registrado'};}
 function schedule(order){const date=/^\d{4}-\d{2}-\d{2}$/.test(order.date||'')?order.date.split('-').reverse().join('/'):'Data não registrada';const day=/^\d{4}-\d{2}-\d{2}$/.test(order.date||'')?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'short'}).format(new Date(order.date+'T12:00:00Z')):'';return [day,date,order.scheduleName||order.period||(!order.timeSlot?'Período não registrado':''),order.timeSlot||'',...(order.scheduleMode==='now'?['Para agora']:[])].filter(Boolean).join(' · ');}
 const api={stage:order=>statuses[order.status]||'received',channel,schedule,channels};if(typeof module==='object')module.exports=api;else root.OrderPresentation=api;
})(globalThis);
