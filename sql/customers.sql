-- Execute uma vez no SSMS, selecionando o banco Floricultura.
-- Pode ser executado novamente: não redefine nem remove clientes ou pedidos.
USE [Floricultura];
GO
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.Customers', N'U') IS NULL
BEGIN
 CREATE TABLE dbo.Customers (
  id uniqueidentifier NOT NULL PRIMARY KEY,
  name nvarchar(120) NOT NULL,
  phoneKey varchar(13) NOT NULL,
  createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  payload nvarchar(max) NOT NULL CHECK(ISJSON(payload)=1),
  CONSTRAINT UQ_Customers_phoneKey UNIQUE(phoneKey)
 );
END;
-- Recupera nomes e telefones dos pedidos antigos sem alterar esses pedidos.
IF OBJECT_ID(N'dbo.Orders', N'U') IS NOT NULL
BEGIN
 ;WITH Contact AS (
  SELECT createdAt, LEFT(LTRIM(RTRIM(JSON_VALUE(payload,'$.customer'))),120) AS name,
   REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(JSON_VALUE(payload,'$.phone'),'+',''),' ',''),'(',''),')',''),'-','') AS digits
  FROM dbo.Orders
 ), Normalized AS (
  SELECT createdAt,name,CASE WHEN LEN(digits) IN (10,11) THEN '55'+digits ELSE digits END AS phoneKey FROM Contact
 ), Ranked AS (
  SELECT *,ROW_NUMBER() OVER(PARTITION BY phoneKey ORDER BY createdAt DESC) AS rn FROM Normalized
  WHERE LEN(name)>=3 AND name<>N'Consumidor final' AND LEN(phoneKey) IN (12,13)
   AND phoneKey LIKE '55[1-9]%' AND phoneKey NOT LIKE '%[^0-9]%'
 )
 INSERT INTO dbo.Customers(id,name,phoneKey,payload)
 SELECT NEWID(),r.name,r.phoneKey,
  (SELECT r.name AS name,r.phoneKey AS phone,N'Importado de pedido anterior' AS notes FOR JSON PATH,WITHOUT_ARRAY_WRAPPER)
 FROM Ranked r WHERE r.rn=1 AND NOT EXISTS(SELECT 1 FROM dbo.Customers c WITH(UPDLOCK,HOLDLOCK) WHERE c.phoneKey=r.phoneKey);
END;
COMMIT TRANSACTION;
