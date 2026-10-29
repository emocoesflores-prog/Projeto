const sql=require('mssql');
async function append(tx,tenant,events){for(const e of events)await new sql.Request(tx).input('id',sql.UniqueIdentifier,e.id).input('tenant',sql.UniqueIdentifier,tenant).input('product',sql.Int,e.productId).input('at',sql.DateTime2,new Date(e.at)).input('kind',sql.VarChar(30),e.kind).input('payload',sql.NVarChar(sql.MAX),JSON.stringify(e)).query('INSERT INTO dbo.ProductEvents(id,tenantId,productId,createdAt,kind,payload) VALUES(@id,@tenant,@product,@at,@kind,@payload)');}
module.exports={append};
