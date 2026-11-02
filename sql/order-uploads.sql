IF OBJECT_ID(N'dbo.OrderUploads',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.OrderUploads(
  tenantId uniqueidentifier NOT NULL,
  id uniqueidentifier NOT NULL,
  orderId uniqueidentifier NULL,
  tokenHash char(64) NOT NULL,
  originalName nvarchar(160) NOT NULL,
  bytes bigint NOT NULL,
  width int NOT NULL,
  height int NOT NULL,
  createdAt datetime2 NOT NULL,
  expiresAt datetime2 NOT NULL,
  CONSTRAINT PK_OrderUploads PRIMARY KEY(tenantId,id)
 );
 CREATE INDEX IX_OrderUploads_Order ON dbo.OrderUploads(tenantId,orderId) INCLUDE(id,originalName,bytes,width,height);
 CREATE INDEX IX_OrderUploads_Expiration ON dbo.OrderUploads(tenantId,expiresAt,id) WHERE orderId IS NULL;
END;
IF OBJECT_ID(N'dbo.OrderUploadUsage',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.OrderUploadUsage(tenantId uniqueidentifier NOT NULL PRIMARY KEY,bytes bigint NOT NULL);
 INSERT INTO dbo.OrderUploadUsage(tenantId,bytes) SELECT tenantId,SUM(bytes) FROM dbo.OrderUploads GROUP BY tenantId;
END;
