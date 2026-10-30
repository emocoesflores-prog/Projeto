(function(root){
 const options=typeof module==='object'?require('./order-options'):root.orderOptions;
 const validSlot=s=>/^([01]\d|2[0-3]):[0-5]\d - ([01]\d|2[0-3]):[0-5]\d$/.test(s)&&s.slice(0,5)<s.slice(-5);
 function issue(schedule,order,now=new Date()){
  if(!schedule?.enabled||order.scheduleMode==='now'||order.fulfillment==='store')return null;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(order.date||''))return 'Escolha o dia do agendamento.';
  const weekday=new Date(order.date+'T12:00:00Z').getUTCDay();
  if(!schedule.days.includes(weekday)||schedule.blockedDates.includes(order.date))return 'Esta data não está disponível para '+options.modality(order.fulfillment).toLowerCase()+'.';
  const max=new Date(options.localDate(now)+'T12:00:00Z');max.setUTCDate(max.getUTCDate()+schedule.horizonDays);
  if(order.date<options.localDate(now)||order.date>max.toISOString().slice(0,10))return 'Escolha uma data dentro do prazo de agendamento da loja.';
  const slot=schedule.slots.find(s=>s.label===order.timeSlot&&s.modes.includes(order.fulfillment));
  if(!slot)return 'Escolha um período disponível para a modalidade.';
  const end=new Date(order.date+'T'+slot.label.slice(-5)+':00-03:00');
  if(end.getTime()<=now.getTime()+schedule.leadMinutes*60000)return 'Este período não aceita mais solicitações. Escolha outro horário.';
  return null;
 }
 function slots(schedule,date,mode,now=new Date()){return (schedule?.enabled?schedule.slots.filter(s=>s.modes.includes(mode)).map(s=>s.label):options.slots).map(label=>({label,disabled:schedule?.enabled?!!issue(schedule,{date,fulfillment:mode,scheduleMode:'scheduled',timeSlot:label},now):options.expired(date,label,now)}));}
 function discount(coupons,code,subtotal,today=options.localDate()){
  if(!code)return {amount:0,coupon:null};const coupon=(coupons||[]).find(c=>c.code===String(code).trim().toUpperCase());
  if(!coupon||!coupon.active||today<coupon.starts||today>coupon.ends||subtotal<coupon.minimum||coupon.limit>0&&(coupon.used||0)>=coupon.limit)throw Error('Cupom indisponível, vencido ou não aplicável a este pedido.');
  const amount=Math.min(subtotal,coupon.type==='percent'?Math.floor(subtotal*coupon.value/100):coupon.value);return {amount,coupon:{id:coupon.id,code:coupon.code,type:coupon.type,value:coupon.value,amount}};
 }
 function capacity(schedule,order){if(!schedule?.enabled||order.scheduleMode==='now'||order.fulfillment==='store')return 0;const slot=schedule.slots.find(s=>s.label===order.timeSlot&&s.modes.includes(order.fulfillment));return slot?(slot.capacity??schedule.maxOrdersPerSlot??0):0;}
 function occupies(order,date,slot,excludeId){return order.id!==excludeId&&order.status!=='Cancelado'&&order.scheduleMode!=='now'&&['delivery','pickup'].includes(order.fulfillment)&&order.date===date&&order.timeSlot===slot;}
 const paymentLabel=(code,name)=>name||({pix:'PIX',credit_card:'Cartão de crédito',debit_card:'Cartão de débito',cash:'Dinheiro',bank_transfer:'Transferência'}[code]||'Outra forma de pagamento');
 const api={validSlot,issue,slots,discount,paymentLabel,capacity,occupies};if(typeof module==='object')module.exports=api;else root.ShopRules=api;
})(globalThis);
