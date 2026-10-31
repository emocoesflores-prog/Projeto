const {createHash}=require('node:crypto');
function fingerprint(data){const value={...data};delete value.expectedTotal;delete value.clientRequestId;if(value.scheduleMode==='now'){delete value.date;delete value.period;delete value.timeSlot;}return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function replay(existing,registration){if(!existing)return null;if(existing.registration.signature!==registration.signature)throw Object.assign(Error('Este envio já foi registrado com outros dados. Inicie uma nova venda.'),{status:409});return existing;}
function orderId(tenant,key){const h=createHash('sha256').update('inova-order-v1:'+String(tenant).toLowerCase()+':'+String(key).toLowerCase()).digest('hex').split('');h[12]='8';h[16]=((parseInt(h[16],16)&3)|8).toString(16);const s=h.join('');return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20,32);}
module.exports={fingerprint,replay,orderId};
