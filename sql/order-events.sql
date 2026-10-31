-- 3.11: histórico separado do pedido. Execute no banco atual, sem recriá-lo.
-- Compatível com acesso legado e multiempresa. Horários em UTC.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.OrderEvents',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.OrderEvents (
  tenantId uniqueidentifier NOT NULL,
  orderId uniqueidentifier NOT NULL,
  eventNumber int NOT NULL,
  occurredAt datetime2(3) NOT NULL,
  actorId uniqueidentifier NULL,
  actorName nvarchar(120) NOT NULL,
  actorRole varchar(30) NULL,
  eventType nvarchar(40) NOT NULL,
  description nvarchar(2000) NOT NULL,
  orderVersion int NOT NULL,
  details nvarchar(max) NOT NULL CONSTRAINT CK_OrderEvents_Details CHECK(ISJSON(details)=1),
  CONSTRAINT PK_OrderEvents PRIMARY KEY CLUSTERED(tenantId,orderId,eventNumber),
  CONSTRAINT FK_OrderEvents_Order FOREIGN KEY(orderId) REFERENCES dbo.Orders(id)
 );
 CREATE INDEX IX_OrderEvents_ActorDate ON dbo.OrderEvents(tenantId,actorId,occurredAt DESC) INCLUDE(orderId,eventNumber,eventType);
END;
IF OBJECT_ID(N'dbo.OrderEventChanges',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.OrderEventChanges (
  tenantId uniqueidentifier NOT NULL,
  orderId uniqueidentifier NOT NULL,
  eventNumber int NOT NULL,
  position smallint NOT NULL,
  field nvarchar(60) NOT NULL,
  beforeJson nvarchar(max) NOT NULL CONSTRAINT CK_OrderEventChanges_Before CHECK(ISJSON(beforeJson)=1),
  afterJson nvarchar(max) NOT NULL CONSTRAINT CK_OrderEventChanges_After CHECK(ISJSON(afterJson)=1),
  CONSTRAINT PK_OrderEventChanges PRIMARY KEY CLUSTERED(tenantId,orderId,eventNumber,position),
  CONSTRAINT FK_OrderEventChanges_Event FOREIGN KEY(tenantId,orderId,eventNumber) REFERENCES dbo.OrderEvents(tenantId,orderId,eventNumber)
 );
END;
COMMIT;
