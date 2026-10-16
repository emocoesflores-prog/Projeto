(function(root){
  function localDate(date=new Date()) { return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(date); }
  function nextDays(today=localDate()) { return [0,1,2].map(offset=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)}); }
  function summarize(orders,today=localDate()) {
    const active=orders.filter(o=>o.status!=='Cancelado');
    return {total:orders.length,pending:active.filter(o=>o.paymentStatus==='pending').length,today:active.filter(o=>o.date===today).length,cancelled:orders.length-active.length,days:nextDays(today).map(date=>({date,orders:active.filter(o=>o.date===date)}))};
  }
  function customers(orders) {const map=new Map();for(const o of orders){const key=o.phone.replace(/\D/g,'');const c=map.get(key)||{name:o.customer,phone:o.phone,count:0};c.count++;map.set(key,c)}return [...map.values()]}
  const model={localDate,nextDays,summarize,customers};
  if(typeof module==='object')module.exports=model;else root.dashboardModel=model;
})(globalThis);
