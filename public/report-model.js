(function(root){
 function groupDaily(rows,mode='day'){const groups=new Map();for(const row of rows){let key=row.label;if(mode==='month')key=key.slice(0,7);if(mode==='week'){const date=new Date(key+'T12:00:00Z'),weekday=date.getUTCDay();date.setUTCDate(date.getUTCDate()-(weekday+6)%7);key=date.toISOString().slice(0,10);}const old=groups.get(key)||{label:key,count:0,value:0};old.count+=row.count;old.value+=row.value;groups.set(key,old);}return [...groups.values()];}
 function previous(from,to){const days=Math.round((Date.parse(to)-Date.parse(from))/86400000)+1;if(!Number.isFinite(days)||days<1||days>366)throw Error('Escolha um período válido de até 366 dias.');const end=new Date(Date.parse(from)-86400000).toISOString().slice(0,10),start=new Date(Date.parse(from)-days*86400000).toISOString().slice(0,10);return {from:start,to:end};}
 function change(current,old){if(!old)return current?'Sem base anterior':'Sem variação';return ((current-old)/old*100).toLocaleString('pt-BR',{maximumFractionDigits:1,signDisplay:'always'})+'% em relação ao anterior';}
 function csvCell(v){const s=String(v??'');return '"'+(/^[=+\-@\t\r\n]/.test(s)?"'":'')+s.replaceAll('"','""')+'"';}
 const api={groupDaily,previous,change,csvCell};if(typeof module==='object')module.exports=api;else root.ReportModel=api;
})(globalThis);
