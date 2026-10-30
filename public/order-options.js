/* Opções compartilhadas pelo PDV e pelo servidor. Horários em America/Sao_Paulo. */
(function(root){
 const slots=['09:10 - 10:50','10:50 - 12:30','13:40 - 15:20','15:20 - 17:00','17:00 - 18:40'];
 function localDate(date=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(date)}
 function localTime(date=new Date()){return new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date)}
 function period(slot){return Number(slot.slice(0,2))<12?'Manhã':'Tarde'}
 function expired(date,slot,now=new Date()){return date<localDate(now)||(date===localDate(now)&&slot.slice(-5)<=localTime(now))}
 function modality(mode){return {store:'Venda Loja',pickup:'Retirada',delivery:'Entrega'}[mode]||'Não informada'}
 function scheduleLabel(order){if(order.scheduleMode==='now')return 'Pedido para agora';const date=new Date(order.date+'T12:00:00Z').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});return date+' · '+(order.timeSlot||order.period)}
 const api={slots,localDate,localTime,period,expired,modality,scheduleLabel};
 if(typeof module==='object')module.exports=api;else root.orderOptions=api;
})(globalThis);
