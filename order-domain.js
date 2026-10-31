const {z}=require('zod');
const {detailsSchema,today}=require('./validation');
const orderOptions=require('./public/order-options');
class OrderError extends Error{constructor(message,status=409){super(message);this.status=status}}
const flow=require('./public/order-flow');
function nextStatus(order){return flow.next(order)}
function normalizeOrder(order){return {...order,id:String(order.id||'').toLowerCase(),status:flow.status(order),version:order.version||0,paymentStatus:order.paymentStatus||'pending',history:order.history||[],checklist:order.checklist||{arrangement:false,card:false,packaging:false}}}
function event(order,type,description){order.history.push({at:new Date().toISOString(),actor:'Administrador',type,description})}
const revision=z.number().int().nonnegative();
const mutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('status'),version:revision,status:z.string(),reason:z.string().trim().max(500).default('')}),
 require('./payment-domain').schema,
 z.object({action:z.literal('payment'),version:revision,confirmed:z.literal(true),reference:z.string().trim().min(4).max(160)}),
 z.object({action:z.literal('details'),version:revision,details:detailsSchema}),
 z.object({action:z.literal('production'),version:revision,checklist:z.object({arrangement:z.boolean(),card:z.boolean(),packaging:z.boolean()}),florist:z.string().trim().max(100),driver:z.string().trim().max(100),internalNote:z.string().trim().max(1000)})
]);
function applyMutation(original,input,options={}){
 const parsed=mutationSchema.safeParse(input);if(!parsed.success)throw new OrderError('Confira os dados, a confirmação e a versão do pedido.',400);
 const data=parsed.data,order=normalizeOrder(structuredClone(original));
 if(data.action==='settlement'){const previous=require('./payment-domain').replay(order,data);if(previous)return previous;}
 if(data.version!==order.version)throw new OrderError('Este pedido foi alterado em outra tela. Atualize os dados antes de continuar.');
 if(flow.closed(order))throw new OrderError('Este pedido já foi encerrado e não pode ser alterado.');
 if(order.status==='Entregue'&&!(data.action==='status'&&data.status==='Concluído'))throw new OrderError('A entrega já foi confirmada. Finalize o pedido como Concluído.');
 switch(data.action){
  case 'settlement':require('./payment-domain').apply(order,data,options);break;
  case 'payment':
   if(order.paymentStatus==='paid')throw new OrderError('O pagamento já foi registrado.');
   const method={id:order.paymentMethod,name:require('./public/shop-rules').paymentLabel(order.paymentMethod,order.paymentMethodName),active:true};
   require('./payment-domain').apply(order,{operationId:require('node:crypto').randomUUID(),entries:[{id:require('node:crypto').randomUUID(),method:method.id,tendered:require('./payment-domain').balance(order),reference:data.reference}]},{...options,methods:[method]});break;
  case 'status':
   if(data.status==='Cancelado'){
    if(data.reason.length<3)throw new OrderError('Informe o motivo do cancelamento.',400);
    order.status='Cancelado';order.refundRequired=require('./payment-domain').paid(order)>0;
    event(order,'status',`Pedido cancelado: ${data.reason}${order.refundRequired?'. Pagamento já registrado: verificar estorno fora do sistema.':''}`);break;
   }
   if(order.paymentStatus!=='paid')throw new OrderError('Registre a confirmação do recebimento antes de iniciar a produção.',400);
   if(data.status!==nextStatus(order))throw new OrderError('Etapa inválida para este pedido.',400);
   if(data.status===flow.ready(order)&&(!order.checklist.arrangement||!order.checklist.packaging||(order.message&&!order.checklist.card)))throw new OrderError('Confira arranjo, embalagem e cartão antes de marcar como pronto.');
   if(data.status==='Saiu para entrega'&&!order.driver)throw new OrderError('Informe o entregador antes de despachar.');
   if(data.status==='Em preparação')order.workshopStartedAt=new Date().toISOString();
   order.status=data.status;if(data.status==='Concluído')order.completedAt=new Date().toISOString();if(data.status==='Entregue')order.deliveredAt=new Date().toISOString();event(order,'status',`Etapa alterada para ${data.status}.`);break;
  case 'details':{
   if(['Saiu para entrega','Pronto aguardando retirada'].includes(order.status))throw new OrderError('Os dados de entrega não podem mudar após a expedição.');
   if(data.details.pickupLocationId&&data.details.pickupLocationId!==order.pickupLocationId)throw new OrderError('O local de retirada deste pedido está preservado. Crie outro pedido para alterar a unidade.');
   if(data.details.fulfillment!==order.fulfillment)throw new OrderError('A modalidade não pode ser alterada: crie outro pedido para preservar o frete original.');
   if(data.details.date!==order.date&&data.details.date<today())throw new OrderError('O novo agendamento não pode ser no passado.',400);
   if(data.details.timeSlot&&(data.details.date!==order.date||data.details.timeSlot!==order.timeSlot)&&orderOptions.expired(data.details.date,data.details.timeSlot))throw new OrderError('A nova faixa de horário já terminou.',400);
   const changes=Object.keys(data.details).filter(key=>data.details[key]!==order[key]);
   const auditChanges=changes.map(field=>({field,before:order[field]??null,after:data.details[field]??null}));
   Object.assign(order,data.details);
   const cardChanged=changes.some(key=>['message','anonymous','recipient','customer'].includes(key));
   const flowersChanged=changes.some(key=>['flowerNotes','substitution'].includes(key));
   if(cardChanged)order.checklist.card=false;
   if(flowersChanged)order.checklist.arrangement=false;
   if((cardChanged||flowersChanged)&&order.status===flow.ready(order)){order.status='Aguardando preparação';delete order.workshopStartedAt;event(order,'status','Conferência reiniciada após alterar o cartão ou as orientações do arranjo.');}
   event(order,'details',`Dados atualizados: ${changes.join(', ')||'sem alteração de campos'}. Valores e itens preservados.`);order.history.at(-1).changes=auditChanges;break;
  }
  case 'production':
   const productionChanges=['checklist','florist','driver','internalNote'].filter(field=>JSON.stringify(order[field])!==JSON.stringify(data[field])).map(field=>({field,before:order[field]??null,after:data[field]}));
   if([flow.ready(order),'Saiu para entrega'].includes(order.status)&&(!data.checklist.arrangement||!data.checklist.packaging||(order.message&&!data.checklist.card)))throw new OrderError('O pedido já foi conferido. Não remova conferências de um pedido pronto ou expedido.');
   Object.assign(order,{checklist:data.checklist,florist:data.florist,driver:data.driver,internalNote:data.internalNote});
   event(order,'production','Checklist, responsáveis e observações internas atualizados.');order.history.at(-1).changes=productionChanges;break;
 }
 if(options.actor)for(const e of order.history.slice(original.history?.length||0))e.actor=options.actor.name;
 order.version++;order.updatedAt=new Date().toISOString();return order;
}
module.exports={OrderError,normalizeOrder,applyMutation,nextStatus};
