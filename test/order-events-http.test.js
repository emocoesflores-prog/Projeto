process.env.DATA_MODE='demo';process.env.AUTH_MODE='multi';process.env.ADMIN_TOKEN='events-http-fixture';
const {test}=require('node:test'),assert=require('node:assert/strict'),app=require('../server');
test('stream autenticado avisa outras telas após commit; falhas não notificam e outra loja não recebe os eventos',async()=>{
 const server=app.listen(0),base='http://127.0.0.1:'+server.address().port,controllers=[];
 async function api(path,body,session,method=body?'POST':'GET'){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(session?{cookie:session.cookie,'X-CSRF-Token':session.csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();return {code:r.status,...data,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 async function stream(session){const controller=new AbortController();controllers.push(controller);const r=await fetch(base+'/api/admin/events',{headers:{cookie:session.cookie},signal:controller.signal});assert.equal(r.status,200);const values=[],reader=r.body.getReader(),decoder=new TextDecoder();let buffer='';const running=(async()=>{try{while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);if(block.startsWith('data: '))values.push(JSON.parse(block.slice(6)));}}}catch{}})();return {values,running};}
 async function wait(fn){const until=Date.now()+2000;while(!fn()){if(Date.now()>until)throw Error('Evento não recebido imediatamente');await new Promise(r=>setTimeout(r,10));}}
 try{
  assert.equal((await fetch(base+'/api/admin/events')).status,401);
  await api('/api/auth/bootstrap',{setupKey:process.env.ADMIN_TOKEN,name:'Gestor',username:'gestor-eventos',password:'senha-eventos-123'});const master=await api('/api/auth/management/login',{username:'gestor-eventos',password:'senha-eventos-123'});
  await api('/api/platform/tenants/00000000-0000-4000-8000-000000000001/access',{name:'Dona A',username:'dona-eventos-a',password:'senha-eventos-123'},master);
  const created=await api('/api/platform/tenants',{name:'Loja B eventos',slug:'loja-b-eventos',profile:{},ownerName:'Dona B',username:'dona-eventos-b',password:'senha-eventos-123'},master);
  assert.equal(created.code,201);
  const a=await api('/api/auth/login',{username:'dona-eventos-a',password:'senha-eventos-123'}),b=await api('/api/auth/login',{username:'dona-eventos-b',password:'senha-eventos-123'});
  const one=await stream(a),two=await stream(a),other=await stream(b);await wait(()=>one.values.length&&two.values.length&&other.values.length);const n=one.values.length,m=two.values.length,k=other.values.length;
  const o=await api('/api/orders?store=emocoes-flores',{customer:'Cliente Eventos',phone:'11988887777',recipient:'Pessoa Eventos',fulfillment:'pickup',date:'2099-01-01',period:'Manhã',timeSlot:'09:10 - 10:50',paymentMethod:'pix',items:[{id:1,quantity:1}]});assert.equal(o.code,201);
  await wait(()=>one.values.length>n&&two.values.length>m);assert.equal(other.values.length,k);const order=await api('/api/admin/orders/'+o.id,undefined,a);assert.equal(order.status,'Aguardando pagamento');
  const before=one.values.length;const fail=await api('/api/admin/orders/'+o.id,{action:'status',status:'Aguardando preparação',version:0},a,'PATCH');assert.equal(fail.code,400);await new Promise(r=>setTimeout(r,50));assert.equal(one.values.length,before);
  const ops=await api('/api/admin/operations',undefined,a);
  const saved=await api('/api/admin/operations',{action:'configuration.save',version:ops.state.revision,data:{module:'pickup',settings:{preparationMinutes:17,showCustomerName:false}}},a);assert.equal(saved.code,200);
  const nowOrder=await api('/api/admin/orders',{fulfillment:'pickup',scheduleMode:'now',customer:'Cliente Agora',phone:'11999999999',recipient:'Pessoa Agora',paymentMethod:'pix',items:[{id:1,quantity:1}]},a);assert.equal(nowOrder.code,201);assert.equal(nowOrder.preparationMinutes,17);
  const paid=await api('/api/admin/orders/'+nowOrder.id,{action:'payment',version:0,confirmed:true,reference:'Recebido no caixa'},a,'PATCH');assert.equal(paid.status,'Aguardando preparação');
  const board=await api('/api/admin/pickup-board',undefined,a);assert.equal(board.orders.length,1);assert.equal(board.orders[0].id,nowOrder.id);assert.equal(Date.parse(board.orders[0].estimateAt)-Date.parse(paid.payment.recordedAt),17*60000);assert.equal((await api('/api/admin/pickup-board',undefined,b)).orders.length,0);assert.equal((await api('/api/admin/operations',undefined,b)).configuration.pickup.preparationMinutes,30);
  await api('/api/admin/orders/'+o.id,{action:'payment',version:0,confirmed:true,reference:'Pix conferido'},a,'PATCH');assert.equal((await api('/api/admin/pickup-board',undefined,a)).orders.length,1,'Agendados futuros não entram antes da liberação');
  const denied=await fetch(base+'/api/admin/events',{headers:{cookie:a.cookie,'X-Store-Slug':'loja-b-eventos'}});assert.equal(denied.status,401);
 }finally{controllers.forEach(c=>c.abort());server.closeAllConnections();await new Promise(r=>server.close(r));}
});
