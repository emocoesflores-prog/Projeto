-- Execute em um banco SQL Server previamente criado.
IF OBJECT_ID('dbo.Orders','U') IS NULL
CREATE TABLE dbo.Orders (
 id uniqueidentifier NOT NULL PRIMARY KEY,
 createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
 status nvarchar(40) NOT NULL DEFAULT 'Aguardando pagamento',
 total int NOT NULL CHECK(total > 0),
 payload nvarchar(max) NOT NULL CHECK(ISJSON(payload)=1)
);

IF OBJECT_ID('dbo.StoreSettings','U') IS NULL
CREATE TABLE dbo.StoreSettings (
 id int NOT NULL PRIMARY KEY CHECK(id=1),
 deliveryFee int NOT NULL CHECK(deliveryFee BETWEEN 0 AND 100000)
);
IF NOT EXISTS (SELECT 1 FROM dbo.StoreSettings WHERE id=1)
INSERT INTO dbo.StoreSettings(id,deliveryFee) VALUES(1,2000);
