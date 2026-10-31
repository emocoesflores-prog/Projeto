-- Rascunhos privados por floricultura e operador. Não são pedidos nem movimentam estoque/caixa.
IF OBJECT_ID(N'dbo.PdvDrafts',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.PdvDrafts(
  tenantId uniqueidentifier NOT NULL,
  userId uniqueidentifier NOT NULL,
  id uniqueidentifier NOT NULL,
  version int NOT NULL,
  state varchar(12) NOT NULL CHECK(state IN ('active','discarded','converted')),
  createdAt datetime2 NOT NULL,
  updatedAt datetime2 NOT NULL,
  orderId uniqueidentifier NULL,
  payload nvarchar(max) NOT NULL CHECK(ISJSON(payload)=1),
  CONSTRAINT PK_PdvDrafts PRIMARY KEY(tenantId,userId,id)
 );
 CREATE INDEX IX_PdvDrafts_Owner_State ON dbo.PdvDrafts(tenantId,userId,state,updatedAt DESC);
END;
