-- Execute no banco atual, após backup, usando uma conta autorizada a alterar o esquema.
-- Não muda de banco e não remove pedidos, clientes ou configurações existentes.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
DECLARE @original uniqueidentifier='00000000-0000-4000-8000-000000000001';
IF OBJECT_ID(N'dbo.Tenants',N'U') IS NULL
 CREATE TABLE dbo.Tenants(id uniqueidentifier NOT NULL PRIMARY KEY,name nvarchar(120) NOT NULL,slug varchar(80) NOT NULL UNIQUE,active bit NOT NULL DEFAULT 1,profile nvarchar(max) NOT NULL CHECK(ISJSON(profile)=1),createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME());
IF NOT EXISTS(SELECT 1 FROM dbo.Tenants WHERE id=@original)
BEGIN
 DECLARE @fee int=2000;
 IF OBJECT_ID(N'dbo.StoreSettings',N'U') IS NOT NULL SELECT @fee=deliveryFee FROM dbo.StoreSettings WHERE id=1;
 DECLARE @profile nvarchar(max)=(SELECT N'Florzinha' AS assistantName,JSON_QUERY(N'["Mauá","Santo André","Ribeirão Pires"]') AS deliveryCities,@fee AS deliveryFee,N'Rua Havana, 95, Parque das Américas, Mauá – SP' AS pickupAddress FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
 INSERT INTO dbo.Tenants(id,name,slug,active,profile) VALUES(@original,N'Floricultura Emoções Flores','emocoes-flores',1,@profile);
END;
DECLARE @platform uniqueidentifier='00000000-0000-4000-8000-000000000002';
IF NOT EXISTS(SELECT 1 FROM dbo.Tenants WHERE id=@platform)
 INSERT INTO dbo.Tenants(id,name,slug,active,profile) VALUES(@platform,N'Inova Facil Consultoria e Solucoes em Tecnologia Ltda - ME','inova-facil-management',1,N'{"phone":"11966333900","document":"53770070000195","assistantName":"Assistente","deliveryCities":[]}');
IF OBJECT_ID(N'dbo.AppUsers',N'U') IS NULL
 CREATE TABLE dbo.AppUsers(id uniqueidentifier NOT NULL PRIMARY KEY,tenantId uniqueidentifier NOT NULL REFERENCES dbo.Tenants(id),username varchar(80) NOT NULL UNIQUE,name nvarchar(120) NOT NULL,passwordHash varchar(250) NOT NULL,role varchar(12) NOT NULL CHECK(role IN ('master','owner','staff')),active bit NOT NULL DEFAULT 1,createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME());
UPDATE dbo.AppUsers SET tenantId=@platform WHERE role='master' AND tenantId=@original;
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.AppUsers') AND name='UQ_AppUsers_tenant_owner') CREATE UNIQUE INDEX UQ_AppUsers_tenant_owner ON dbo.AppUsers(tenantId) WHERE role='owner';
IF OBJECT_ID(N'dbo.AppSessions',N'U') IS NULL
 CREATE TABLE dbo.AppSessions(tokenHash char(64) NOT NULL PRIMARY KEY,userId uniqueidentifier NOT NULL REFERENCES dbo.AppUsers(id),expiresAt datetime2 NOT NULL,csrf char(64) NOT NULL);
IF COL_LENGTH(N'dbo.Orders',N'tenantId') IS NULL
 ALTER TABLE dbo.Orders ADD tenantId uniqueidentifier NOT NULL CONSTRAINT DF_Orders_tenant DEFAULT('00000000-0000-4000-8000-000000000001') WITH VALUES;
IF COL_LENGTH(N'dbo.Customers',N'tenantId') IS NULL
 ALTER TABLE dbo.Customers ADD tenantId uniqueidentifier NOT NULL CONSTRAINT DF_Customers_tenant DEFAULT('00000000-0000-4000-8000-000000000001') WITH VALUES;
IF OBJECT_ID(N'dbo.UQ_Customers_phoneKey',N'UQ') IS NOT NULL ALTER TABLE dbo.Customers DROP CONSTRAINT UQ_Customers_phoneKey;
-- Dynamic statements also support the first execution, when columns were added in this batch.
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.Customers') AND name='UQ_Customers_tenant_phone') EXEC(N'CREATE UNIQUE INDEX UQ_Customers_tenant_phone ON dbo.Customers(tenantId,phoneKey)');
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.Orders') AND name='IX_Orders_tenant_date') EXEC(N'CREATE INDEX IX_Orders_tenant_date ON dbo.Orders(tenantId,createdAt DESC)');
IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE name='FK_Orders_tenant') EXEC(N'ALTER TABLE dbo.Orders ADD CONSTRAINT FK_Orders_tenant FOREIGN KEY(tenantId) REFERENCES dbo.Tenants(id)');
IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE name='FK_Customers_tenant') EXEC(N'ALTER TABLE dbo.Customers ADD CONSTRAINT FK_Customers_tenant FOREIGN KEY(tenantId) REFERENCES dbo.Tenants(id)');
COMMIT TRANSACTION;
