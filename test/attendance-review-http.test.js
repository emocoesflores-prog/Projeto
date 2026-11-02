process.env.DATA_MODE='demo';process.env.AUTH_MODE='multi';process.env.ADMIN_TOKEN='attendance-review-fixture';
const {test}=require('node:test'),assert=require('node:assert/strict'),app=require('../server');
test('equipe compartilha a rede sem dividir a cota; transferência é auditada e conexões/credenciais ficam com o responsável',async()=>{
 const server=app.listen(0),base='http://127.0.0.1:'+server.address().port;
 async function api(path,body,session,method=body===undefined?'GET':'POST'){
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
 }
 async function ok(...args){const response=await api(...args);assert.ok(response.status<300,JSON.stringify(response));return response;}
 try{
  await ok('/api/auth/bootstrap',{setupKey:process.env.ADMIN_TOKEN,name:'Gestor',username:'gestor-revisao',password:'senha-gestor-revisao'});
  const management=await ok('/api/auth/management/login',{username:'gestor-revisao',password:'senha-gestor-revisao'}),master={cookie:management.cookie,csrf:management.data.csrf};
  await ok('/api/platform/tenants',{name:'Floricultura Revisão',slug:'atendimento-revisao',ownerName:'Responsável Loja',username:'loja-revisao',password:'senha-loja-revisao',profile:{}},master);
  const login=await ok('/api/auth/login',{username:'loja-revisao',password:'senha-loja-revisao'}),owner={cookie:login.cookie,csrf:login.data.csrf},staff=[];
  for(let index=1;index<=3;index++){
   const user=(await ok('/api/admin/team',{name:'Atendente '+index,username:'atendente-revisao-'+index,password:'senha-atendente-revisao',active:true},owner)).data;
   const session=await ok('/api/auth/login',{username:user.username,password:'senha-atendente-revisao'});staff.push({...user,cookie:session.cookie,csrf:session.data.csrf});
  }
  const path='/api/admin/attendance/whatsapp/chats/5511999999999%40c.us';let desk=(await ok(path,undefined,owner)).data;
  desk=(await ok(path,{action:'claim',version:desk.version},owner,'PATCH')).data;
  const before=desk.version;desk=(await ok(path,{action:'assign',version:desk.version,userId:staff[0].id,reason:' Troca de turno com passagem do atendimento '},owner,'PATCH')).data;
  assert.equal(desk.assignedUserId,staff[0].id);assert.equal((await api(path,{action:'assign',version:before,userId:staff[1].id,reason:'Tentativa com versão antiga'},owner,'PATCH')).status,409);
  const history=(await ok(path+'/timeline',undefined,owner)).data;
  assert.equal(history.events[0].reason,'Troca de turno com passagem do atendimento');assert.equal(history.events[0].actor.name,'Responsável Loja');
  assert.equal((await api(path,{action:'claim',version:desk.version},staff[1],'PATCH')).status,403);
  for(const route of ['/api/admin/whatsapp/connect','/api/admin/whatsapp/disconnect','/api/admin/channels/instagram/connect','/api/admin/channels/gmail/disconnect','/api/admin/channels/oauth/fixture/finish'])assert.equal((await api(route,{},staff[0])).status,403,route);
  assert.equal((await api('/api/admin/integrations/assistant',{key:'fixture-key',model:'gpt-4.1-mini',instructions:''},staff[0])).status,403);
  assert.equal((await api('/api/admin/assistant-settings',{assistantName:'Assistente não autorizada'},staff[0],'PUT')).status,403);
  await ok('/api/admin/assistant-settings',{assistantName:'Florzinha Revisada'},owner,'PUT');
  // Cada pessoa executa menos que sua própria cota; o total na mesma rede supera 300.
  const results=[];for(let batch=0;batch<7;batch++)results.push(...await Promise.all(staff.flatMap(user=>Array.from({length:15},()=>api('/api/admin/team',undefined,user)))));
  assert.equal(results.length,315);assert.ok(results.every(result=>result.status===200),'Atendentes distintos não devem bloquear a operação uns dos outros.');
 }finally{await app.locals.workshopService.stop();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
