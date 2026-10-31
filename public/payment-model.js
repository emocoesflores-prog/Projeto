/* Valores monetários sempre em centavos; leitura compartilhada de recebimentos. */
(function(root){
 function receipts(o){if(Array.isArray(o.receipts))return o.receipts;if(o.paymentStatus==='paid')return [{id:'legacy-'+o.id,method:o.payment?.method||o.paymentMethod,methodName:o.paymentMethodName||'',amount:o.payment?.amount??o.total,tendered:o.payment?.amount??o.total,change:0,reference:o.payment?.reference||'',recordedAt:o.payment?.recordedAt||o.createdAt,legacy:true}];return [];}
 const paid=o=>receipts(o).reduce((sum,r)=>sum+r.amount,0);
 const balance=o=>Math.max(0,o.total-paid(o));
 function discount(base,shipping,spec){if(!spec||!spec.value)return 0;return spec.type==='percent'?Math.round((base-(shipping||0))*spec.value/10000):spec.value;}
 const api={receipts,paid,balance,discount};if(typeof module==='object')module.exports=api;else root.PaymentModel=api;
})(globalThis);
