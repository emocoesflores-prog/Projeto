const sql=require('mssql');
const {DEFAULT_TENANT}=require('./tenant-context');
const CACHE_SIZE=20,PAGE_SIZE=50;
// Legacy arrays are numbered once. Subsequent writes append only new events.
function prepare(order){
 let count=order.historyCount||0;const events=[];
 const history=(order.history||[]).map(original=>{
  const event=structuredClone(original);
  if(!Number.isSafeInteger(event.sequence)){event.sequence=++count;event.orderVersion=order.version||0;events.push(event);}
  else count=Math.max(count,event.sequence);
  return event;
 });
 order.historyCount=count;order.history=history.slice(-CACHE_SIZE);return events;
}
function page(events,before=Number.MAX_SAFE_INTEGER){const rows=events.filter(e=>e.sequence<before).sort((a,b)=>b.sequence-a.sequence).slice(0,PAGE_SIZE+1);return {events:rows.slice(0,PAGE_SIZE),nextBefore:rows.length>PAGE_SIZE?rows[PAGE_SIZE-1].sequence:null};}
async function append(tx,tenantId,order){
 const events=prepare(order);if(!events.length)return;
 const rows=events.map(e=>({sequence:e.sequence,at:e.at,actorId:e.actorId||null,actor:e.actor||'Não registrado',actorRole:e.actorRole||null,type:e.type||'legacy',description:e.description||'',orderVersion:e.orderVersion??order.version??0,details:JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k])=>!['sequence','at','actorId','actor','actorRole','type','description','orderVersion','changes'].includes(k)))),changes:(e.changes||[]).map((c,i)=>({position:i,field:c.field,beforeJson:JSON.stringify({value:c.before??null}),afterJson:JSON.stringify({value:c.after??null})}))}));
 await new sql.Request(tx).input('tenant',sql.UniqueIdentifier,tenantId||DEFAULT_TENANT).input('order',sql.UniqueIdentifier,order.id).input('events',sql.NVarChar(sql.MAX),JSON.stringify(rows)).query(`
 INSERT INTO dbo.OrderEvents(tenantId,orderId,eventNumber,occurredAt,actorId,actorName,actorRole,eventType,description,orderVersion,details)
 SELECT @tenant,@order,e.sequence,CONVERT(datetime2,e.at,127),e.actorId,e.actor,e.actorRole,e.type,e.description,e.orderVersion,e.details
 FROM OPENJSON(@events) WITH(sequence int,at nvarchar(40),actorId uniqueidentifier,actor nvarchar(120),actorRole varchar(30),type nvarchar(40),description nvarchar(2000),orderVersion int,details nvarchar(max)) e;
 INSERT INTO dbo.OrderEventChanges(tenantId,orderId,eventNumber,position,field,beforeJson,afterJson)
 SELECT @tenant,@order,e.sequence,c.position,c.field,c.beforeJson,c.afterJson
 FROM OPENJSON(@events) WITH(sequence int,changes nvarchar(max) AS JSON) e
 CROSS APPLY OPENJSON(e.changes) WITH(position smallint,field nvarchar(60),beforeJson nvarchar(max),afterJson nvarchar(max)) c;
 `);
}
async function read(pool,tenantId,orderId,before=2147483647){
 const result=await pool.request().input('tenant',sql.UniqueIdentifier,tenantId||DEFAULT_TENANT).input('order',sql.UniqueIdentifier,orderId).input('before',sql.Int,before).query(`
 DECLARE @page TABLE(eventNumber int PRIMARY KEY);
 INSERT INTO @page SELECT TOP(51) eventNumber FROM dbo.OrderEvents WHERE tenantId=@tenant AND orderId=@order AND eventNumber<@before ORDER BY eventNumber DESC;
 SELECT e.* FROM dbo.OrderEvents e JOIN @page p ON p.eventNumber=e.eventNumber WHERE e.tenantId=@tenant AND e.orderId=@order ORDER BY e.eventNumber DESC;
 SELECT c.* FROM dbo.OrderEventChanges c JOIN @page p ON p.eventNumber=c.eventNumber WHERE c.tenantId=@tenant AND c.orderId=@order ORDER BY c.eventNumber DESC,c.position;
 `);
 const changes=new Map();for(const c of result.recordsets[1]){if(!changes.has(c.eventNumber))changes.set(c.eventNumber,[]);changes.get(c.eventNumber).push({field:c.field,before:JSON.parse(c.beforeJson).value,after:JSON.parse(c.afterJson).value});}
 return page(result.recordsets[0].map(r=>({...JSON.parse(r.details),sequence:r.eventNumber,at:r.occurredAt.toISOString(),actor:r.actorName,actorId:r.actorId,actorRole:r.actorRole,type:r.eventType,description:r.description,orderVersion:r.orderVersion,...(changes.has(r.eventNumber)?{changes:changes.get(r.eventNumber)}:{})})),before);
}
module.exports={prepare,page,append,read,CACHE_SIZE,PAGE_SIZE};
