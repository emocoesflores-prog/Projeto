const {createHash}=require('node:crypto'),{z}=require('zod');
const providers=['whatsapp','instagram','facebook','gmail','outlook','imap'];
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('claim'),version:z.number().int().nonnegative()}).strict(),
 z.object({action:z.literal('assign'),version:z.number().int().nonnegative(),userId:z.uuid().nullable(),reason:z.string().trim().max(300).default('')}).strict(),
 z.object({action:z.literal('update'),version:z.number().int().nonnegative(),patch:z.object({status:z.enum(['new','open','done']).optional(),favorite:z.boolean().optional(),aiEnabled:z.boolean().optional(),orderId:z.union([z.uuid(),z.literal('')]).optional()}).strict()}).strict(),
 z.object({action:z.literal('link'),version:z.number().int().nonnegative(),customerId:z.uuid().nullable()}).strict()
]);
const hash=id=>createHash('sha256').update(id).digest('hex');
function fail(message,status=409){throw Object.assign(Error(message),{status});}
function key(provider,id){if(!providers.includes(provider)||typeof id!=='string'||!id||id.length>500||/[\x00-\x1f]/.test(id))fail('Conversa inválida.',400);return hash(id);}
const identity=actor=>({id:actor.id,name:actor.name,role:actor.role});
function initial(seed={},team=[]){const found=team.filter(u=>u.active&&u.name===seed.assignedTo);return {version:0,status:seed.status||'new',favorite:!!seed.favorite,aiEnabled:!!seed.aiEnabled,assignedUserId:seed.assignedUserId||(found.length===1?found[0].id:null),customerId:seed.customerId||null,orderId:seed.orderId||'',legacyNotes:seed.notes||'',history:[]};}
function editable(current,actor){return actor.role==='owner'||!current.assignedUserId||current.assignedUserId===actor.id;}
function apply(current,input,actor,team,now=new Date()){
 const parsed=schema.safeParse(input);if(!parsed.success)fail('Confira a operação e a versão do atendimento.',400);const data=parsed.data,next=structuredClone(current);
 if(data.version!==current.version)fail('Outro atendente alterou esta conversa. Atualize e confira os dados.');
 if(current.leaseUntil&&new Date(current.leaseUntil)>now)fail('Há uma mensagem em envio. Aguarde a confirmação antes de alterar o atendimento.');
 if(!editable(current,actor)&&!(data.action==='update'&&Object.keys(data.patch).every(k=>k==='favorite')))fail('Esta conversa está com outro atendente. Peça a transferência ao responsável.',403);
 if(data.action==='claim'){next.assignedUserId=actor.id;next.status='open';}
 if(data.action==='assign'){if(data.userId&&!team.some(u=>u.id===data.userId&&u.active))fail('Selecione um atendente ativo desta floricultura.',400);next.assignedUserId=data.userId;if(data.userId)next.status='open';}
 if(data.action==='update')Object.assign(next,data.patch);
 if(data.action==='link')next.customerId=data.customerId;
 const changes=['assignedUserId','status','favorite','aiEnabled','customerId','orderId'].filter(k=>JSON.stringify(next[k])!==JSON.stringify(current[k])).map(field=>({field,before:current[field]??null,after:next[field]??null}));
 if(!changes.length)return {next,event:null};next.version++;next.updatedAt=now.toISOString();const event={action:data.action,at:next.updatedAt,actor:identity(actor),changes,...(data.action==='assign'&&data.reason?{reason:data.reason}:{})};return {next,event};
}
function canSend(current,actor,now=new Date()){if(current.status==='done')fail('Reabra o atendimento antes de enviar uma resposta.');if(current.assignedUserId!==actor.id)fail(current.assignedUserId?'Esta conversa está com outro atendente.':'Assuma o atendimento antes de enviar uma resposta.',403);if(current.leaseUntil&&new Date(current.leaseUntil)>now)fail('Há uma mensagem em envio nesta conversa. Aguarde a confirmação.');}
module.exports={providers,key,hash,identity,initial,apply,canSend,editable,fail};
