const {z}=require('zod');
const {detailsSchema,today}=require('./validation');
const options=require('./public/order-options');
class OrderError extends Error{constructor(message,status=409){super(message);this.status=status}}
const terminal=['Entregue','Retirado','Concluído na loja','Cancelado'];
function nextStatus(order){return {'Recebido':'Em preparação','Agendado':'Em preparação','Em preparação':'Pronto','Pronto':order.fulfillment==='delivery'?'Saiu para entrega':order.fulfillment==='store'?'Concluído na loja':'Esperando retirada','Esperando retirada':'Retirado','Saiu para entrega':'Entregue'}[order.status]||null}
function normalizeOrder(order){return {...order,version:order.version||0,paymentStatus:order.paymentStatus||'pending',history:order.history||[],checklist:order.checklist||{arrangement:false,card:false,packaging:false}}}
function event(order,type,description){order.history.push({at:new Date().toISOString(),actor:'Administrador',type,description})}
const revision=z.number().int().nonnegative();
const mutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('status'),version:revision,status:z.string(),reason:z.string().trim().max(500).default('')}),
 z.object({action:z.literal('payment'),version:revision,confirmed:z.literal(true),reference:z.string().trim().min(4).max(160)}),
 z.object({action:z.literal('details'),version:revision,details:detailsSchema}),
 z.object({action:z.literal('production'),version:revision,checklist:z.object({arrangement:z.boolean(),card:z.boolean(),packaging:z.boolean()}),florist:z.string().trim().max(100),driver:z.string().trim().max(100),internalNote:z.string().trim().max(1000)})
]);
function applyMutation(original,input){
 const parsed=mutationSchema.safeParse(input);if(!parsed.success)throw new OrderError('Confira os dados, a confirmação e a versão do pedido.',400);
 const data=parsed.data,order=normalizeOrder(structuredClone(original));
 if(data.version!==order.version)throw new OrderError('Este pedido foi alterado em outra tela. Atualize os dados antes de continuar.');
 if(terminal.includes(order.status))throw new OrderError('Este pedido já foi encerrado e não pode ser alterado.');
 switch(data.action){
  case 'payment':
   if(order.paymentStatus==='paid')throw new OrderError('O pagamento já foi registrado.');
   order.paymentStatus='paid';order.payment={method:order.paymentMethod,amount:order.total,reference:data.reference,recordedAt:new Date().toISOString(),source:'manual'};order.status=order.scheduleMode==='now'?'Recebido':'Agendado';
   event(order,'payment',`Recebimento integral registrado manualmente (${order.paymentMethod==='pix'?'PIX':'cartão de crédito'}). Referência: ${data.reference}. Sem cobrança ou verificação bancária pelo sistema.`);break;
  case 'status':
   if(data.status==='Cancelado'){
    if(data.reason.length<3)throw new OrderError('Informe o motivo do cancelamento.',400);
    order.status='Cancelado';order.refundRequired=order.paymentStatus==='paid';
    event(order,'status',`Pedido cancelado: ${data.reason}${order.refundRequired?'. Pagamento já registrado: verificar estorno fora do sistema.':''}`);break;
   }
   if(order.paymentStatus!=='paid')throw new OrderError('Registre a confirmação do recebimento antes de iniciar a produção.',400);
   if(data.status!==nextStatus(order))throw new OrderError('Etapa inválida para este pedido.',400);
   if(data.status==='Pronto'&&(!order.checklist.arrangement||!order.checklist.packaging||(order.message&&!order.checklist.card)))throw new OrderError('Confira arranjo, embalagem e cartão antes de marcar como pronto.');
   if(data.status==='Saiu para entrega'&&!order.driver)throw new OrderError('Informe o entregador antes de despachar.');
   order.status=data.status;event(order,'status',`Etapa alterada para ${data.status}.`);break;
  case 'details':{
   if(['Saiu para entrega','Esperando retirada'].includes(order.status))throw new OrderError('Os dados de entrega não podem mudar após a expedição.');
   if(data.details.fulfillment!==order.fulfillment)throw new OrderError('A modalidade não pode ser alterada: crie outro pedido para preservar o frete original.');
   if(data.details.date!==order.date&&data.details.date<today())throw new OrderError('O novo agendamento não pode ser no passado.',400);
   if(data.details.timeSlot&&(data.details.date!==order.date||data.details.timeSlot!==order.timeSlot)&&options.expired(data.details.date,data.details.timeSlot))throw new OrderError('A nova faixa de horário já terminou.',400);
   const changes=Object.keys(data.details).filter(key=>data.details[key]!==order[key]);
   const auditChanges=changes.map(field=>({field,before:order[field]??null,after:data.details[field]??null}));
   Object.assign(order,data.details);
   const cardChanged=changes.some(key=>['message','anonymous','recipient','customer'].includes(key));
   const flowersChanged=changes.some(key=>['flowerNotes','substitution'].includes(key));
   if(cardChanged)order.checklist.card=false;
   if(flowersChanged)order.checklist.arrangement=false;
   if((cardChanged||flowersChanged)&&order.status==='Pronto'){order.status='Em preparação';event(order,'status','Conferência reiniciada após alterar o cartão ou as orientações do arranjo.');}
   event(order,'details',`Dados atualizados: ${changes.join(', ')||'sem alteração de campos'}. Valores e itens preservados.`);order.history.at(-1).changes=auditChanges;break;
  }
  case 'production':
   const productionChanges=['checklist','florist','driver','internalNote'].filter(field=>JSON.stringify(order[field])!==JSON.stringify(data[field])).map(field=>({field,before:order[field]??null,after:data[field]}));
   if(['Pronto','Saiu para entrega','Esperando retirada'].includes(order.status)&&(!data.checklist.arrangement||!data.checklist.packaging||(order.message&&!data.checklist.card)))throw new OrderError('O pedido já foi conferido. Não remova conferências de um pedido pronto ou expedido.');
   Object.assign(order,{checklist:data.checklist,florist:data.florist,driver:data.driver,internalNote:data.internalNote});
   event(order,'production','Checklist, responsáveis e observações internas atualizados.');order.history.at(-1).changes=productionChanges;break;
 }
 order.version++;order.updatedAt=new Date().toISOString();return order;
}
module.exports={OrderError,normalizeOrder,applyMutation,nextStatus};
