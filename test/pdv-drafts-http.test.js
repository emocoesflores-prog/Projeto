process.env.DATA_MODE='demo';process.env.AUTH_MODE='multi';process.env.ADMIN_TOKEN='drafts-fixture-token';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),app=require('../server');
test('rascunho autenticado não cria pedido, aceita incompleto e encerra após registro idempotente',async()=>{
 const server=app.listen(0),base='http://127.0.0.1:'+server.address().port;
 async function api(path,body,s,method=body?'POST':'GET'){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(s?{cookie:s.cookie,'X-CSRF-Token':s.csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const ok=async(...args)=>{const r=await api(...args);assert.ok(r.status<300,JSON.stringify(r.data));return r;};
 try{
  await ok('/api/auth/bootstrap',{setupKey:process.env.ADMIN_TOKEN,name:'Gestor',username:'gestor',password:'senha-gestor-rascunho'});const m=await ok('/api/auth/management/login',{username:'gestor',password:'senha-gestor-rascunho'}),master={cookie:m.cookie,csrf:m.data.csrf};
  async function shop(slug){await ok('/api/platform/tenants',{name:'Loja '+slug,slug,ownerName:'Responsável '+slug,username:slug,password:'senha-loja-rascunho',profile:{}},master);const r=await ok('/api/auth/login',{username:slug,password:'senha-loja-rascunho'});return {cookie:r.cookie,csrf:r.data.csrf};}
  const a=await shop('rascunho-a'),b=await shop('rascunho-b'),id=randomUUID(),path='/api/admin/pdv-drafts/'+id;
  const data={items:[],customerId:null,customerName:'',query:'Cliente ainda sendo digitado',address:null,timing:{mode:'scheduled',date:'',slot:''},channel:'pdv',values:{fulfillment:'delivery',pickupLocationId:'',paymentMethod:'pix',occasion:'Sem ocasião específica',deliveryNotes:'',flowerNotes:'',substitution:'contact',message:'Cartão ainda em edição',anonymous:false,couponCode:''}};
  assert.equal((await api(path,{version:0,data},undefined,'PUT')).status,401);assert.equal((await api(path,{version:0,data},{cookie:a.cookie},'PUT')).status,403);
  let record=(await ok(path,{version:0,data},a,'PUT')).data;assert.equal((await ok('/api/admin/orders',undefined,a)).data.length,0);assert.equal((await api(path,undefined,b)).status,404);assert.equal((await ok('/api/admin/pdv-drafts',undefined,b)).data.length,0);
  assert.equal((await ok(path,undefined,a)).data.data.values.message,data.values.message);
  data.values.fulfillment='store';data.timing={mode:'now',date:'',slot:''};data.query='';data.items=[{id:1,quantity:1,note:''}];record=(await ok(path,{version:record.version,data},a,'PUT')).data;
  const orderBody={clientRequestId:id,fulfillment:'store',scheduleMode:'now',paymentMethod:'pix',items:[{id:1,quantity:1}]};const pair=await Promise.all([ok('/api/admin/orders',orderBody,a),ok('/api/admin/orders',orderBody,a)]);assert.equal(pair[0].data.id,pair[1].data.id);
  await ok(path+'/complete',{version:record.version},a);assert.equal((await ok('/api/admin/pdv-drafts',undefined,a)).data.length,0);assert.equal((await api(path,undefined,a)).status,404);assert.equal((await api(path,{version:record.version+1,data},a,'PUT')).status,409);assert.equal((await ok('/api/admin/orders',undefined,a)).data.length,1);
 }finally{await app.locals.workshopService.stop();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
