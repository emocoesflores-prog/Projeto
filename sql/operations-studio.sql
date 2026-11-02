SET XACT_ABORT ON; SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON; SET CONCAT_NULL_YIELDS_NULL ON; SET ARITHABORT ON; SET NUMERIC_ROUNDABORT OFF;
BEGIN TRAN;
IF OBJECT_ID(N'dbo.AppUsers',N'U') IS NOT NULL AND COL_LENGTH(N'dbo.AppUsers',N'version') IS NULL ALTER TABLE dbo.AppUsers ADD version int NOT NULL CONSTRAINT DF_AppUsers_Version DEFAULT 0;
IF OBJECT_ID(N'dbo.StaffEvents',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.StaffEvents(id bigint IDENTITY PRIMARY KEY,tenantId uniqueidentifier NOT NULL,userId uniqueidentifier NOT NULL,createdAt datetime2 NOT NULL,actorId uniqueidentifier NOT NULL,payload nvarchar(max) NOT NULL CHECK(ISJSON(payload)=1));
 CREATE INDEX IX_StaffEvents_Tenant ON dbo.StaffEvents(tenantId,userId,id DESC);
END;
IF OBJECT_ID(N'dbo.CustomerDeskInfo',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.CustomerDeskInfo(tenantId uniqueidentifier NOT NULL,customerId uniqueidentifier NOT NULL,version int NOT NULL,payload nvarchar(max) NOT NULL CHECK(ISJSON(payload)=1),updatedAt datetime2 NOT NULL,CONSTRAINT PK_CustomerDeskInfo PRIMARY KEY(tenantId,customerId));
 CREATE TABLE dbo.CustomerDeskEvents(id bigint IDENTITY PRIMARY KEY,tenantId uniqueidentifier NOT NULL,customerId uniqueidentifier NOT NULL,createdAt datetime2 NOT NULL,actorId uniqueidentifier NOT NULL,payload nvarchar(max) NOT NULL CHECK(ISJSON(payload)=1));
 CREATE INDEX IX_CustomerDeskEvents_Customer ON dbo.CustomerDeskEvents(tenantId,customerId,id DESC);
END;
IF OBJECT_ID(N'dbo.Conversations',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.Conversations(tenantId uniqueidentifier NOT NULL,provider varchar(16) NOT NULL,chatHash char(64) NOT NULL,externalId nvarchar(500) NOT NULL,version int NOT NULL,assignedUserId uniqueidentifier NULL,status varchar(12) NOT NULL,customerId uniqueidentifier NULL,payload nvarchar(max) NOT NULL CHECK(ISJSON(payload)=1),updatedAt datetime2 NOT NULL,leaseId uniqueidentifier NULL,leaseUntil datetime2 NULL,CONSTRAINT PK_Conversations PRIMARY KEY(tenantId,provider,chatHash));
 CREATE INDEX IX_Conversations_Owner ON dbo.Conversations(tenantId,assignedUserId,status,updatedAt DESC);
 CREATE INDEX IX_Conversations_Customer ON dbo.Conversations(tenantId,customerId,updatedAt DESC) WHERE customerId IS NOT NULL;
 CREATE TABLE dbo.ConversationEvents(id bigint IDENTITY PRIMARY KEY,tenantId uniqueidentifier NOT NULL,provider varchar(16) NOT NULL,chatHash char(64) NOT NULL,createdAt datetime2 NOT NULL,actorId uniqueidentifier NULL,payload nvarchar(max) NOT NULL CHECK(ISJSON(payload)=1));
 CREATE INDEX IX_ConversationEvents_Chat ON dbo.ConversationEvents(tenantId,provider,chatHash,id DESC);
 CREATE TABLE dbo.ConversationNotes(tenantId uniqueidentifier NOT NULL,id uniqueidentifier NOT NULL,provider varchar(16) NOT NULL,chatHash char(64) NOT NULL,createdAt datetime2 NOT NULL,actorId uniqueidentifier NOT NULL,actorName nvarchar(120) NOT NULL,body nvarchar(4000) NOT NULL,CONSTRAINT PK_ConversationNotes PRIMARY KEY(tenantId,id));
 CREATE INDEX IX_ConversationNotes_Chat ON dbo.ConversationNotes(tenantId,provider,chatHash,createdAt,id);
 CREATE TABLE dbo.ConversationSends(tenantId uniqueidentifier NOT NULL,operationId uniqueidentifier NOT NULL,provider varchar(16) NOT NULL,chatHash char(64) NOT NULL,bodyHash char(64) NOT NULL,state varchar(16) NOT NULL,messageId nvarchar(500) NULL,actorId uniqueidentifier NOT NULL,actorName nvarchar(120) NOT NULL,createdAt datetime2 NOT NULL,updatedAt datetime2 NOT NULL,CONSTRAINT PK_ConversationSends PRIMARY KEY(tenantId,operationId));
 CREATE INDEX IX_ConversationSends_Chat ON dbo.ConversationSends(tenantId,provider,chatHash,createdAt DESC) INCLUDE(messageId,actorName,state);
 CREATE TABLE dbo.StaffPresence(tenantId uniqueidentifier NOT NULL,userId uniqueidentifier NOT NULL,status varchar(12) NOT NULL,lastSeenAt datetime2 NOT NULL,CONSTRAINT PK_StaffPresence PRIMARY KEY(tenantId,userId));
 CREATE INDEX IX_StaffPresence_Active ON dbo.StaffPresence(tenantId,lastSeenAt DESC);
END;
IF OBJECT_ID(N'dbo.DriverAccess',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.DriverAccess(tenantId uniqueidentifier NOT NULL,driverId uniqueidentifier NOT NULL,publicId uniqueidentifier NOT NULL UNIQUE,tokenHash char(64) NOT NULL,encryptedToken nvarchar(500) NOT NULL,version int NOT NULL,active bit NOT NULL,createdAt datetime2 NOT NULL,updatedAt datetime2 NOT NULL,CONSTRAINT PK_DriverAccess PRIMARY KEY(tenantId,driverId));
 CREATE TABLE dbo.DriverSessions(tokenHash char(64) NOT NULL PRIMARY KEY,tenantId uniqueidentifier NOT NULL,driverId uniqueidentifier NOT NULL,accessVersion int NOT NULL,createdAt datetime2 NOT NULL,expiresAt datetime2 NOT NULL);
 CREATE INDEX IX_DriverSessions_Driver ON dbo.DriverSessions(tenantId,driverId,expiresAt);
 CREATE INDEX IX_DriverSessions_Expiry ON dbo.DriverSessions(expiresAt);
 CREATE TABLE dbo.DeliveryNotifications(id uniqueidentifier NOT NULL PRIMARY KEY,tenantId uniqueidentifier NOT NULL,routeId uniqueidentifier NOT NULL,driverId uniqueidentifier NOT NULL,assignmentVersion int NOT NULL,state varchar(16) NOT NULL,attempts int NOT NULL,nextAttemptAt datetime2 NOT NULL,createdAt datetime2 NOT NULL,updatedAt datetime2 NOT NULL,leaseUntil datetime2 NULL,messageId nvarchar(500) NULL,error nvarchar(500) NOT NULL DEFAULT '',CONSTRAINT UQ_DeliveryNotifications_Assignment UNIQUE(tenantId,routeId,driverId,assignmentVersion));
 CREATE INDEX IX_DeliveryNotifications_Pending ON dbo.DeliveryNotifications(state,nextAttemptAt) INCLUDE(tenantId,routeId,driverId,attempts,leaseUntil);
 CREATE TABLE dbo.DeliveryTracking(tenantId uniqueidentifier NOT NULL,orderId uniqueidentifier NOT NULL,publicId uniqueidentifier NOT NULL UNIQUE,tokenHash char(64) NOT NULL,encryptedToken nvarchar(500) NOT NULL,createdAt datetime2 NOT NULL,expiresAt datetime2 NOT NULL,CONSTRAINT PK_DeliveryTracking PRIMARY KEY(tenantId,orderId));
END;

IF OBJECT_ID(N'dbo.Tenants',N'U') IS NOT NULL AND COL_LENGTH(N'dbo.Tenants',N'publicDomainKey') IS NULL
BEGIN
 ALTER TABLE dbo.Tenants ADD publicDomainKey AS CONVERT(varchar(253),JSON_VALUE(profile,'$.operations.configuration.domain.hostname')) PERSISTED;
 EXEC(N'CREATE INDEX IX_Tenants_PublicDomain ON dbo.Tenants(publicDomainKey) INCLUDE(id,active)');
END;

IF OBJECT_ID(N'dbo.Orders',N'U') IS NOT NULL AND COL_LENGTH(N'dbo.Orders',N'tenantId') IS NOT NULL AND COL_LENGTH(N'dbo.Orders',N'customerKey') IS NULL
BEGIN
 ALTER TABLE dbo.Orders ADD customerKey AS CONVERT(varchar(36),JSON_VALUE(payload,'$.customerId')) PERSISTED;
 EXEC(N'CREATE INDEX IX_Orders_CustomerDesk ON dbo.Orders(tenantId,customerKey,createdAt DESC,id DESC)');
END;
IF OBJECT_ID(N'dbo.Orders',N'U') IS NOT NULL AND COL_LENGTH(N'dbo.Orders',N'tenantId') IS NOT NULL AND COL_LENGTH(N'dbo.Orders',N'contactPhoneKey') IS NULL
BEGIN
 ALTER TABLE dbo.Orders ADD contactPhoneKey AS CONVERT(varchar(30),REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(JSON_VALUE(payload,'$.phone'),''),'+',''),' ',''),'(',''),')',''),'-',''),'.','')) PERSISTED;
 EXEC(N'CREATE INDEX IX_Orders_ContactDesk ON dbo.Orders(tenantId,contactPhoneKey,createdAt DESC,id DESC) INCLUDE(customerKey)');
END;

IF OBJECT_ID(N'dbo.CustomerProfileEvents',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.CustomerProfileEvents(id bigint IDENTITY PRIMARY KEY,tenantId uniqueidentifier NOT NULL,customerId uniqueidentifier NOT NULL,createdAt datetime2 NOT NULL,actorId uniqueidentifier NOT NULL,payload nvarchar(max) NOT NULL CHECK(ISJSON(payload)=1));
 CREATE INDEX IX_CustomerProfileEvents_Customer ON dbo.CustomerProfileEvents(tenantId,customerId,id DESC);
END;

COMMIT;
