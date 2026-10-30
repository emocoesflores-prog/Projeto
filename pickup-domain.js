const flow=require('./public/order-flow'),workshop=require('./public/workshop-model');
function visible(o){return o.fulfillment==='pickup'&&o.paymentStatus==='paid'&&['queue','production','pickup'].includes(flow.stage(o));}
function estimate(order,preferences){const minutes=order.preparationMinutes??preferences.preparationMinutes,w=workshop.windowOf(order);const at=order.scheduleMode==='now'?new Date(Date.parse(order.payment?.recordedAt||order.createdAt)+minutes*60000):w?.start;return {...order,preparationMinutes:minutes,estimateAt:at&&Number.isFinite(+at)?at.toISOString():null};}
module.exports={visible,estimate};
