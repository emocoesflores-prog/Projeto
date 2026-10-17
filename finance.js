const {z}=require('zod');
const {randomUUID}=require('node:crypto');
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'Informe uma data válida.').refine(v=>{const d=new Date(v+'T12:00:00Z');return !Number.isNaN(+d)&&d.toISOString().slice(0,10)===v},'Informe uma data válida.');
const command=z.discriminatedUnion('action',[
 z.object({action:z.literal('configure'),enabled:z.boolean(),blockPanel:z.boolean(),blockSite:z.boolean()}).strict(),
 z.object({action:z.literal('charge'),description:z.string().trim().min(3).max(160),amount:z.number().int().min(1).max(100000000),dueDate:date}).strict(),
 z.object({action:z.literal('pay'),id:z.uuid(),paidDate:date,method:z.enum(['pix','boleto','card','transfer','cash','other']),note:z.string().trim().max(300).default('')}).strict(),
 z.object({action:z.literal('cancel'),id:z.uuid(),reason:z.string().trim().min(5).max(300)}).strict()
]);
function access(tenant,today=day()){
 const billing=tenant.profile.billing||{},overdue=(billing.charges||[]).filter(c=>c.status==='pending'&&c.dueDate<today);
 return {blocked:billing.enabled!==false&&overdue.length>0,blockPanel:billing.blockPanel!==false,blockSite:billing.blockSite!==false,overdueCount:overdue.length,overdueAmount:overdue.reduce((sum,c)=>sum+c.amount,0),nextDue:(billing.charges||[]).filter(c=>c.status==='pending').map(c=>c.dueDate).sort()[0]||null};
}
function change(previous,input,actor){
 const parsed=command.safeParse(input);if(!parsed.success)throw Object.assign(Error(parsed.error.issues[0]?.message||'Confira os dados financeiros.'),{status:400});
 const data=parsed.data,billing=structuredClone(previous||{enabled:true,blockPanel:true,blockSite:true,charges:[],history:[]}),at=new Date().toISOString();
 billing.charges||=[];billing.history||=[];
 if(data.action==='configure'){if(!data.blockPanel&&!data.blockSite)throw Object.assign(Error('Escolha pelo menos uma área para o bloqueio.'),{status:400});billing.enabled=data.enabled;billing.blockPanel=data.blockPanel;billing.blockSite=data.blockSite;}
 else if(data.action==='charge'){
  if(billing.charges.length>=500)throw Object.assign(Error('Limite de 500 cobranças por floricultura atingido.'),{status:400});
  billing.charges.push({id:randomUUID(),description:data.description,amount:data.amount,dueDate:data.dueDate,status:'pending',createdAt:at,createdBy:actor});
 }else{
  const charge=billing.charges.find(c=>c.id===data.id);if(!charge)throw Object.assign(Error('Cobrança não encontrada nesta floricultura.'),{status:404});
  if(charge.status!=='pending')throw Object.assign(Error('Esta cobrança já foi paga ou cancelada. Atualize a lista.'),{status:409});
  if(data.action==='pay'){
   if(data.paidDate>day())throw Object.assign(Error('A confirmação de pagamento não pode ter uma data futura.'),{status:400});
   Object.assign(charge,{status:'paid',paidDate:data.paidDate,method:data.method,note:data.note,confirmedAt:at,confirmedBy:actor});
  }else Object.assign(charge,{status:'cancelled',cancelReason:data.reason,cancelledAt:at,cancelledBy:actor});
 }
 billing.history.push({action:data.action,at,actor,...(data.id?{chargeId:data.id}:{}),...(data.action==='configure'?{enabled:data.enabled,blockPanel:data.blockPanel,blockSite:data.blockSite}:{})});
 return billing;
}
module.exports={access,change,day};
