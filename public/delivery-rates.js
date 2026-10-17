(function(root){
 const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
 function quote(settings,city,neighborhood){
  const rules=settings.deliveryRates||[];
  if(!rules.length){if(settings.deliveryCities&&!settings.deliveryCities.some(value=>normalize(value)===normalize(city)))return {fee:null,error:city?'Cidade fora da área atendida.':'Selecione a cidade de entrega.'};return {fee:settings.deliveryFee??0};}
  const candidates=rules.filter(r=>normalize(r.city)===normalize(city));
  const match=candidates.find(r=>r.neighborhood&&normalize(r.neighborhood)===normalize(neighborhood))||candidates.find(r=>!r.neighborhood);
  return match?{fee:match.fee}:{fee:null,error:!city?'Selecione a cidade de entrega.':!neighborhood&&candidates.length?'Informe um bairro atendido para calcular a entrega.':'Cidade ou bairro fora da área atendida.'};
 }
 const api={normalize,quote};if(typeof module==='object')module.exports=api;else root.DeliveryRates=api;
})(globalThis);
