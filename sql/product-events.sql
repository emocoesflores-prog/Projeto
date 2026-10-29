-- Histórico imutável de cadastro, preços e estoque por floricultura.
IF OBJECT_ID('dbo.ProductEvents','U') IS NULL
BEGIN
 CREATE TABLE dbo.ProductEvents (
  id uniqueidentifier NOT NULL PRIMARY KEY,
  tenantId uniqueidentifier NOT NULL,
  productId int NOT NULL,
  createdAt datetime2 NOT NULL,
  kind varchar(30) NOT NULL,
  payload nvarchar(max) NOT NULL CHECK(ISJSON(payload)=1)
 );
 CREATE INDEX IX_ProductEvents_Tenant_Product_Date ON dbo.ProductEvents(tenantId,productId,createdAt DESC,id);
END;
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.ProductEvents') AND name='IX_ProductEvents_Tenant_Date')
 CREATE INDEX IX_ProductEvents_Tenant_Date ON dbo.ProductEvents(tenantId,createdAt DESC,id DESC) INCLUDE(productId,kind);
