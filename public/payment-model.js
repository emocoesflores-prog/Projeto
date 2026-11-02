/* Valores monetários sempre em centavos; leitura compartilhada de recebimentos. */
(function(root){
 function allReceipts(o){if(Array.isArray(o.receipts))return o.receipts;if(o.paymentStatus==='paid')return [{id:'legacy-'+o.id,method:o.payment?.method||o.paymentMethod,methodName:o.paymentMethodName||'',amount:o.payment?.amount??o.total,tendered:o.payment?.amount??o.total,change:0,reference:o.payment?.reference||'',recordedAt:o.payment?.recordedAt||o.createdAt,legacy:true}];return [];}
 const receipts=o=>allReceipts(o).filter(r=>!r.voided);
 const paid=o=>receipts(o).reduce((sum,r)=>sum+r.amount,0);
 const balance=o=>Math.max(0,o.total-paid(o));
 function summary(o){const received=paid(o),due=balance(o),state=o.total>0&&received>=o.total?'paid':received>0?'partial':'pending';return {state,label:{paid:'PAGO',partial:'PARCIAL',pending:'PENDENTE'}[state],received,balance:due};}
 function discount(base,shipping,spec){if(!spec||!spec.value)return 0;return spec.type==='percent'?Math.round((base-(shipping||0))*spec.value/10000):spec.value;}
 const api={allReceipts,receipts,paid,balance,summary,discount};if(typeof module==='object')module.exports=api;else root.PaymentModel=api;
})(globalThis);
