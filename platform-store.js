const sql=require('mssql');
const {randomUUID}=require('node:crypto');
const {DEFAULT_TENANT,PLATFORM_TENANT,PLATFORM_NAME,PLATFORM_LOGIN,PLATFORM_PHONE}=require('./tenant-context');
const {defaults}=require('./store-settings');
const baseCatalog=require('./catalog');
const initialProfile=()=>({...defaults,assistantName:'Assistente',catalog:structuredClone(baseCatalog),phone:'',email:'',document:'',address:'',city:'',state:''});
function createPlatformStore({demo,getPool}){
 const tenants=new Map([[DEFAULT_TENANT,{id:DEFAULT_TENANT,name:'Floricultura Emoções Flores',slug:'emocoes-flores',active:true,profile:{...initialProfile(),assistantName:'Florzinha',deliveryCities:['Mauá','Santo André','Ribeirão Pires']}}]]),users=new Map(),sessions=new Map();
 tenants.set(PLATFORM_TENANT,{id:PLATFORM_TENANT,name:PLATFORM_NAME,slug:'inova-facil-management',active:true,profile:{phone:PLATFORM_PHONE,document:PLATFORM_LOGIN,assistantName:'Assistente',deliveryCities:[]}});
 const safeTenant=row=>row?{...row,active:!!row.active,profile:typeof row.profile==='string'?JSON.parse(row.profile):structuredClone(row.profile)}:null;
 const request=()=>getPool().request();
 return {
  async hasUsers(){if(demo)return users.size>0;return !!(await request().query('SELECT TOP(1) id FROM dbo.AppUsers')).recordset.length;},
  async tenants(){const list=demo?[...tenants.values()].filter(t=>t.id!==PLATFORM_TENANT).map(safeTenant):(await request().input('platform',sql.UniqueIdentifier,PLATFORM_TENANT).query('SELECT * FROM dbo.Tenants WHERE id<>@platform ORDER BY name')).recordset.map(safeTenant);const owners=demo?[...users.values()].filter(u=>u.role==='owner'):(await request().query("SELECT tenantId,username,name FROM dbo.AppUsers WHERE role='owner'")).recordset;return list.map(t=>({...t,financialAccess:require('./finance').access(t),ownerUsername:owners.find(u=>u.tenantId===t.id)?.username||null,ownerName:owners.find(u=>u.tenantId===t.id)?.name||''}));},
  async tenant(id){if(demo)return safeTenant(tenants.get(id));return safeTenant((await request().input('id',sql.UniqueIdentifier,id).query('SELECT * FROM dbo.Tenants WHERE id=@id')).recordset[0]);},
  async bySlug(slug){if(demo)return safeTenant([...tenants.values()].find(t=>t.slug===slug));return safeTenant((await request().input('slug',sql.VarChar(80),slug).query('SELECT * FROM dbo.Tenants WHERE slug=@slug')).recordset[0]);},
  async user(username){if(demo)return structuredClone([...users.values()].find(u=>u.username===username)||null);return (await request().input('username',sql.VarChar(80),username).query('SELECT * FROM dbo.AppUsers WHERE username=@username')).recordset[0]||null;},
  async create({tenant,user,bootstrap=false}){
   if(demo){if(bootstrap&&users.size)throw Object.assign(Error('O administrador principal já foi criado.'),{status:409});if([...users.values()].some(u=>u.username===user.username||user.role==='owner'&&u.role==='owner'&&u.tenantId===user.tenantId)||tenant&&[...tenants.values()].some(t=>t.slug===tenant.slug))throw Object.assign(Error('Usuário ou endereço da loja já cadastrado.'),{status:409});if(tenant)tenants.set(tenant.id,structuredClone(tenant));users.set(user.id,structuredClone(user));return;}
   const tx=new sql.Transaction(getPool());await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
   try{
    if(bootstrap&&(await new sql.Request(tx).query('SELECT TOP(1) id FROM dbo.AppUsers WITH(UPDLOCK,HOLDLOCK)')).recordset.length)throw Object.assign(Error('O administrador principal já foi criado.'),{status:409});
    if(tenant)await new sql.Request(tx).input('id',sql.UniqueIdentifier,tenant.id).input('name',sql.NVarChar(120),tenant.name).input('slug',sql.VarChar(80),tenant.slug).input('profile',sql.NVarChar(sql.MAX),JSON.stringify(tenant.profile)).query('INSERT INTO dbo.Tenants(id,name,slug,active,profile) VALUES(@id,@name,@slug,1,@profile)');
    await new sql.Request(tx).input('id',sql.UniqueIdentifier,user.id).input('tenantId',sql.UniqueIdentifier,user.tenantId).input('username',sql.VarChar(80),user.username).input('name',sql.NVarChar(120),user.name).input('passwordHash',sql.VarChar(250),user.passwordHash).input('role',sql.VarChar(12),user.role).query('INSERT INTO dbo.AppUsers(id,tenantId,username,name,passwordHash,role,active) VALUES(@id,@tenantId,@username,@name,@passwordHash,@role,1)');
    await tx.commit();
   }catch(e){try{await tx.rollback()}catch{}if([2601,2627].includes(e.number))throw Object.assign(Error('Usuário ou endereço da loja já cadastrado.'),{status:409});throw e;}
  },
  async saveTenant(id,patch,owner){
   const previous=await this.tenant(id);if(!previous)return null;
   let next={...previous,...patch,profile:{...previous.profile,...patch.profile}};
   if(demo){
    const current=[...users.values()].find(u=>u.tenantId===id&&u.role==='owner');
    if(owner){if([...users.values()].some(u=>u.username===owner.username&&u.id!==current?.id))throw Object.assign(Error('Usuário já cadastrado.'),{status:409});if(!current&&!owner.passwordHash)throw Object.assign(Error('Informe uma senha para criar o primeiro acesso da loja.'),{status:400});
     const updated={...(current||{id:randomUUID(),tenantId:id,role:'owner',active:true}),...owner};users.set(updated.id,updated);}
    tenants.set(id,next);
   }else{
    const tx=new sql.Transaction(getPool());await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try{
     const fresh=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).query('SELECT * FROM dbo.Tenants WITH(UPDLOCK,HOLDLOCK) WHERE id=@id')).recordset[0];if(!fresh){await tx.rollback();return null;}const latest=safeTenant(fresh);next={...latest,...patch,profile:{...latest.profile,...patch.profile}};
     if(owner){
      const current=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).query("SELECT id FROM dbo.AppUsers WITH(UPDLOCK,HOLDLOCK) WHERE tenantId=@id AND role='owner'")).recordset[0];
      if(!current&&!owner.passwordHash)throw Object.assign(Error('Informe uma senha para criar o primeiro acesso da loja.'),{status:400});
      const request=new sql.Request(tx).input('tenantId',sql.UniqueIdentifier,id).input('name',sql.NVarChar(120),owner.name).input('username',sql.VarChar(80),owner.username).input('hash',sql.VarChar(250),owner.passwordHash||null);
      if(current)await request.query("UPDATE dbo.AppUsers SET name=@name,username=@username,passwordHash=COALESCE(@hash,passwordHash) WHERE tenantId=@tenantId AND role='owner'");
      else await request.input('id',sql.UniqueIdentifier,randomUUID()).query("INSERT INTO dbo.AppUsers(id,tenantId,username,name,passwordHash,role,active) VALUES(@id,@tenantId,@username,@name,@hash,'owner',1)");
     }
     await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('name',sql.NVarChar(120),next.name).input('active',sql.Bit,next.active).input('profile',sql.NVarChar(sql.MAX),JSON.stringify(next.profile)).query('UPDATE dbo.Tenants SET name=@name,active=@active,profile=@profile WHERE id=@id');
     if(!next.active||owner)await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).query('DELETE s FROM dbo.AppSessions s JOIN dbo.AppUsers u ON u.id=s.userId WHERE u.tenantId=@id');
     await tx.commit();
    }catch(e){try{await tx.rollback()}catch{}if([2601,2627].includes(e.number))throw Object.assign(Error('Usuário já cadastrado.'),{status:409});throw e;}
   }
   if(demo&&(!next.active||owner))await this.invalidateTenant(id);return safeTenant(next);
  },
  async changeFinance(id,input,actor){
   const {change}=require('./finance');
   if(demo){const tenant=tenants.get(id);if(!tenant)return null;tenant.profile.billing=change(tenant.profile.billing,input,actor);return safeTenant(tenant);}
   const tx=new sql.Transaction(getPool());await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
   try{
    const row=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).query('SELECT * FROM dbo.Tenants WITH(UPDLOCK,HOLDLOCK) WHERE id=@id')).recordset[0];
    if(!row){await tx.rollback();return null;}const tenant=safeTenant(row);tenant.profile.billing=change(tenant.profile.billing,input,actor);
    await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('profile',sql.NVarChar(sql.MAX),JSON.stringify(tenant.profile)).query('UPDATE dbo.Tenants SET profile=@profile WHERE id=@id');await tx.commit();return tenant;
   }catch(e){try{await tx.rollback()}catch{}throw e;}
  },
  async invalidateTenant(id){if(demo){for(const [key,s]of sessions)if(users.get(s.userId)?.tenantId===id)sessions.delete(key);}else await request().input('id',sql.UniqueIdentifier,id).query('DELETE s FROM dbo.AppSessions s JOIN dbo.AppUsers u ON u.id=s.userId WHERE u.tenantId=@id');},
  async saveSession(s){if(demo){sessions.set(s.tokenHash,structuredClone(s));return;}await request().input('token',sql.Char(64),s.tokenHash).input('user',sql.UniqueIdentifier,s.userId).input('expires',sql.DateTime2,new Date(s.expiresAt)).input('csrf',sql.Char(64),s.csrf).query('DELETE FROM dbo.AppSessions WHERE expiresAt<SYSUTCDATETIME(); INSERT INTO dbo.AppSessions(tokenHash,userId,expiresAt,csrf) VALUES(@token,@user,@expires,@csrf)');},
  async session(tokenHash){
   if(demo){const s=sessions.get(tokenHash);const u=s&&users.get(s.userId),t=u&&tenants.get(u.tenantId);if(!s||s.expiresAt<Date.now()||!u?.active||!t?.active)return null;return {...s,user:structuredClone(u),tenant:safeTenant(t)};}
   const row=(await request().input('token',sql.Char(64),tokenHash).query('SELECT s.tokenHash,s.csrf,s.expiresAt,u.id,u.tenantId,u.username,u.name,u.role,t.name AS tenantName,t.slug,t.profile FROM dbo.AppSessions s JOIN dbo.AppUsers u ON u.id=s.userId JOIN dbo.Tenants t ON t.id=u.tenantId WHERE s.tokenHash=@token AND s.expiresAt>SYSUTCDATETIME() AND u.active=1 AND t.active=1')).recordset[0];
   return row?{tokenHash:row.tokenHash,csrf:row.csrf,expiresAt:row.expiresAt,user:{id:row.id,tenantId:row.tenantId,username:row.username,name:row.name,role:row.role},tenant:{id:row.tenantId,name:row.tenantName,slug:row.slug,active:true,profile:JSON.parse(row.profile)}}:null;
  },
  async deleteSession(token){if(demo)sessions.delete(token);else await request().input('token',sql.Char(64),token).query('DELETE FROM dbo.AppSessions WHERE tokenHash=@token');},
  async resetOwner(tenantId,passwordHash){if(demo){for(const u of users.values())if(u.tenantId===tenantId&&u.role==='owner')u.passwordHash=passwordHash;}else await request().input('id',sql.UniqueIdentifier,tenantId).input('hash',sql.VarChar(250),passwordHash).query("UPDATE dbo.AppUsers SET passwordHash=@hash WHERE tenantId=@id AND role='owner'");await this.invalidateTenant(tenantId);},
  newTenant(data){const profile={...initialProfile(),pickupAddress:'',deliveryFee:0,...data.profile};if(!profile.deliveryCities)profile.deliveryCities=data.profile.deliveryFee!==undefined&&profile.city?[profile.city]:[];return {id:randomUUID(),name:data.name,slug:data.slug,active:true,profile};}
 };
}
module.exports={createPlatformStore,initialProfile};
