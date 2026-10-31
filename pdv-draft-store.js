const {z}=require('zod'),sql=require('mssql');
const text=max=>z.string().max(max);
const dataSchema=z.object({
 items:z.array(z.object({id:z.number().int().positive(),quantity:z.number().int().min(1).max(20),note:text(300)}).strict()).max(30),
 customerId:z.uuid().nullable(),customerName:text(120),query:text(120),
 address:z.object({id:z.uuid(),version:z.number().int().nonnegative()}).strict().nullable(),
 timing:z.object({mode:z.enum(['now','scheduled']),date:text(10),slot:text(40)}).strict(),
 channel:z.enum(['pdv','manual','whatsapp','instagram','facebook','gmail','outlook','imap']),
 values:z.object({fulfillment:z.enum(['store','pickup','delivery']),pickupLocationId:text(80),paymentMethod:text(50),occasion:text(60),deliveryNotes:text(500),flowerNotes:text(1000),substitution:z.enum(['contact','allowed']),message:text(500),anonymous:z.boolean(),couponCode:text(30)}).strict()
}).strict();
const saveSchema=z.object({version:z.number().int().nonnegative(),data:dataSchema}).strict();
const versionSchema=z.object({version:z.number().int().nonnegative()}).strict();
function fail(message,status=409,extra={}){throw Object.assign(Error(message),{status,...extra});}
function parse(schema,input){const p=schema.safeParse(input);if(!p.success)fail('Confira os dados do rascunho.',400);return p.data;}
function decode(row){return {...row,id:row.id.toLowerCase(),createdAt:new Date(row.createdAt).toISOString(),updatedAt:new Date(row.updatedAt).toISOString(),data:JSON.parse(row.payload),payload:undefined};}
function summary(row){return {id:row.id,version:row.version,updatedAt:row.updatedAt,customer:row.data.customerName||row.data.query||'Consumidor final',fulfillment:row.data.values.fulfillment,itemCount:row.data.items.reduce((n,i)=>n+i.quantity,0)};}
function createDraftStore({demo,getPool}){
 const rows=new Map(),key=(tenant,user,id)=>[tenant,user,id].map(v=>v.toLowerCase()).join(':');
 const scoped=(r,tenant,user,id)=>{r.input('tenant',sql.UniqueIdentifier,tenant).input('user',sql.UniqueIdentifier,user);if(id)r.input('id',sql.UniqueIdentifier,id);return r;};
 const ensure=(old,version)=>{if(old?.state&&old.state!=='active')fail('Este rascunho já foi encerrado. Abra a venda em Rascunhos ou inicie outra.');if((old?.version||0)!==version)fail('Este rascunho mudou em outra aba. Salve uma cópia para preservar suas alterações.');};
 async function mutate(tenant,user,id,input,closing=null){
  const p=parse(closing?versionSchema:saveSchema,input),now=new Date().toISOString();
  const change=old=>{ensure(old,p.version);if(closing&&!old)fail('Rascunho não encontrado.',404);return {...old,id,version:p.version+1,state:closing?.state||'active',createdAt:old?.createdAt||now,updatedAt:now,orderId:closing?.orderId||null,data:closing?{}:p.data};};
  if(demo){const k=key(tenant,user,id),old=rows.get(k);if(!old&&!closing&&[...rows.entries()].filter(([k,r])=>k.startsWith(key(tenant,user,''))&&r.state==='active').length>=20)fail('Há 20 rascunhos salvos. Retome ou exclua um deles.',400);const next=change(old);rows.set(k,next);return structuredClone(next);}
  const tx=new sql.Transaction(getPool());await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try{
   const oldRow=(await scoped(new sql.Request(tx),tenant,user,id).query('SELECT * FROM dbo.PdvDrafts WITH(UPDLOCK,HOLDLOCK) WHERE tenantId=@tenant AND userId=@user AND id=@id')).recordset[0];
   const old=oldRow?decode(oldRow):null,next=change(old);
   if(!old&&!closing){const count=await scoped(new sql.Request(tx),tenant,user).query("SELECT COUNT(*) AS n FROM dbo.PdvDrafts WITH(UPDLOCK,HOLDLOCK) WHERE tenantId=@tenant AND userId=@user AND state='active'");if(count.recordset[0].n>=20)fail('Há 20 rascunhos salvos. Retome ou exclua um deles.',400);}
   const r=scoped(new sql.Request(tx),tenant,user,id).input('version',sql.Int,next.version).input('state',sql.VarChar(12),next.state).input('created',sql.DateTime2,new Date(next.createdAt)).input('updated',sql.DateTime2,new Date(now)).input('orderId',sql.UniqueIdentifier,next.orderId).input('payload',sql.NVarChar(sql.MAX),JSON.stringify(next.data));
   await r.query(old?'UPDATE dbo.PdvDrafts SET version=@version,state=@state,updatedAt=@updated,orderId=@orderId,payload=@payload WHERE tenantId=@tenant AND userId=@user AND id=@id':'INSERT INTO dbo.PdvDrafts(tenantId,userId,id,version,state,createdAt,updatedAt,orderId,payload) VALUES(@tenant,@user,@id,@version,@state,@created,@updated,@orderId,@payload)');
   await tx.commit();return next;
  }catch(e){try{await tx.rollback();}catch{}throw e;}
 }
 return {
  async list(tenant,user){if(demo)return [...rows.entries()].filter(([k,r])=>k.startsWith(key(tenant,user,''))&&r.state==='active').map(([,r])=>summary(r)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));return (await scoped(getPool().request(),tenant,user).query("SELECT * FROM dbo.PdvDrafts WHERE tenantId=@tenant AND userId=@user AND state='active' ORDER BY updatedAt DESC")).recordset.map(decode).map(summary);},
  async get(tenant,user,id){if(demo)return structuredClone(rows.get(key(tenant,user,id))||null);const row=(await scoped(getPool().request(),tenant,user,id).query('SELECT * FROM dbo.PdvDrafts WHERE tenantId=@tenant AND userId=@user AND id=@id')).recordset[0];return row?decode(row):null;},
  save:(tenant,user,id,input)=>mutate(tenant,user,id,input),
  close:(tenant,user,id,input,orderId)=>mutate(tenant,user,id,input,{state:orderId?'converted':'discarded',orderId})
 };
}
module.exports={createDraftStore,dataSchema,saveSchema};
