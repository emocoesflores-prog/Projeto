const {z}=require('zod');
const timing=require('./public/order-options'),payments=require('./public/payment-model');
const schema=z.object({action:z.literal('fulfillment'),version:z.number().int().nonnegative(),fulfillment:z.enum(['store','pickup','delivery']),scheduleMode:z.enum(['now','scheduled']),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),timeSlot:z.string().default(''),customerId:z.uuid().optional(),addressId:z.uuid().optional(),addressVersion:z.number().int().nonnegative().optional(),pickupLocationId:z.union([z.uuid(),z.literal('legacy')]).optional(),expectedTotal:z.number().int().positive().optional()}).strict();
function fail(message,status=400){throw new (require('./order-domain').OrderError)(message,status);}
async function resolve(input,order,{customers,settings,quoteDistance=async()=>null}){
 const parsed=schema.safeParse(input);if(!parsed.success)fail('Confira a modalidade e o agendamento.');const data=parsed.data;
 if(!order)fail('Pedido não encontrado.',404);if(data.version!==order.version)fail('Este pedido foi alterado em outra tela. Atualize os dados antes de continuar.',409);
 const changed=data.fulfillment!==order.fulfillment,result={orderId:order.id,version:order.version,fulfillment:data.fulfillment};
 if(changed&&data.fulfillment==='delivery'){
  if(!data.customerId||!data.addressId)fail('Escolha o endereço de entrega do cliente.');
  const {customer,address}=await require('./order-selection').resolve({action:'selection',version:data.version,field:'address',customerId:data.customerId,addressId:data.addressId,addressVersion:data.addressVersion},customers);
  if(order.customerId?order.customerId.toLowerCase()!==customer.id.toLowerCase():require('./contact').normalizePhone(order.phone)!==customer.phone)fail('Selecione primeiro o cliente do pedido na ficha.');
  const quote=require('./public/delivery-rates').quote(settings,address.city,address.neighborhood);
  if(!settings.distance?.enabled&&quote.fee===null)fail(quote.error);
  const road=await quoteDistance(require('./address-domain').formatAddress(address));
  result.customer=customer;result.address=address;result.shippingFee=road?.fee??quote.fee;result.distanceQuote=road;
 }else if(changed)result.shippingFee=0;
 if(changed&&data.fulfillment==='pickup'){
  const points=require('./public/pickup-locations').list(settings),point=points.find(p=>p.id===data.pickupLocationId)||(points.length===1&&!data.pickupLocationId?points[0]:null);
  if(!point)fail('Selecione um local de retirada cadastrado.');
  result.pickupLocation={...point,formattedAddress:require('./public/pickup-locations').format(point)};
 }
 return result;
}
function plan(order,data,resolved){
 if(!resolved||resolved.orderId!==order.id||resolved.version!==order.version||resolved.fulfillment!==data.fulfillment)fail('Reabra a edição e confira a modalidade.',409);
 const changed=data.fulfillment!==order.fulfillment,now=data.scheduleMode==='now',sameNow=now&&order.scheduleMode==='now';
 const details={fulfillment:data.fulfillment,scheduleMode:data.scheduleMode,date:now?(sameNow?order.date:timing.localDate()):data.date,timeSlot:now?'':data.timeSlot,period:now?(sameNow?order.period:(Number(timing.localTime().slice(0,2))<12?'Manhã':'Tarde')):data.timeSlot?timing.period(data.timeSlot):order.period};
 if(!now&&!data.timeSlot&&(changed||order.scheduleMode!=='scheduled'||order.timeSlot))fail('Escolha a faixa de horário do agendamento.');
 const associated={};
 if(changed){
  if(!Number.isSafeInteger(order.shippingFee)&&order.fulfillment==='delivery')fail('Este pedido antigo não tem o frete original registrado. Confira os valores antes de trocar a modalidade.');
  const fee=resolved.shippingFee,oldFee=order.fulfillment==='delivery'?order.shippingFee:0;
  if(!Number.isSafeInteger(fee)||fee<0)fail('Não foi possível calcular o frete desta modalidade.');
  const total=order.total-oldFee+fee;if(!Number.isSafeInteger(total)||total<=0)fail('O total calculado é inválido. Confira o pedido.');
  Object.assign(associated,{shippingFee:fee,total,receipts:payments.receipts(order).map(r=>({...r}))});
  const received=payments.paid(order);associated.paymentStatus=received>=total?'paid':received>0?'partial':'pending';associated.refundRequired=received>total;
  if(order.pricing)associated.pricing={...order.pricing,baseTotal:order.pricing.baseTotal-oldFee+fee};
  if(data.fulfillment==='delivery'){
   const {customer,address}=resolved;if(!customer||!address)fail('Escolha novamente o endereço do cliente.');
   Object.assign(details,{recipient:address.recipient,recipientPhone:address.recipientPhone,address:require('./address-domain').formatAddress(address),city:address.city,neighborhood:address.neighborhood,deliveryReference:address.reference||'',pickupLocationId:''});
   Object.assign(associated,{customerId:customer.id,customerIdentified:true,deliveryAddress:Object.fromEntries(Object.entries(address).filter(([key])=>key!=='history')),pickupLocation:null,distanceQuote:resolved.distanceQuote||null});
  }else{
   Object.assign(details,{address:'',city:undefined,neighborhood:'',deliveryReference:'',pickupLocationId:resolved.pickupLocation?.id||''});
   Object.assign(associated,{deliveryAddress:null,distanceQuote:null,pickupLocation:resolved.pickupLocation||null});
  }
  const complete=require('./validation').detailsSchema.safeParse({...order,...details});if(!complete.success)fail(complete.error.issues[0].message);
  if(associated.paymentStatus!=='paid')associated.status='Aguardando pagamento';
  else if(data.fulfillment==='store'){associated.status='Concluído';associated.completedAt=new Date().toISOString();}
  else if(['Pronto aguardando entregador','Pronto aguardando retirada'].includes(order.status))associated.status=data.fulfillment==='delivery'?'Pronto aguardando entregador':'Pronto aguardando retirada';
 }
 const validation=require('./validation').fieldDetails(order,details);if(!validation.success)fail(validation.error.issues[0].message);
 const total=associated.total??order.total,received=payments.paid(order);
 if(data.expectedTotal!==undefined&&data.expectedTotal!==total)fail('O frete ou o total mudou. Confira os valores atualizados antes de salvar.',409);
 return {details:validation.data,associated,quote:{total,shippingFee:associated.shippingFee??order.shippingFee??0,received,balance:Math.max(0,total-received),credit:Math.max(0,received-total)}};
}
module.exports={schema,resolve,plan};
