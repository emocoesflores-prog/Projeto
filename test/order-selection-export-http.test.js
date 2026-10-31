process.env.DATA_MODE='demo';process.env.AUTH_MODE='multi';process.env.ADMIN_TOKEN='selection-export-fixture';
const {test}=require('node:test'),assert=require('node:assert/strict'),app=require('../server');
test('seleção usa dados reais do cliente/endereço da loja, audita campos e protege versão e vínculo',async()=>{
 const server=app.listen(0),base='http://127.0.0.1:'+server.address().port;
 const request=(path,body,s,method=body?'POST':'GET')=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...(s?{Cookie:s.cookie,'X-CSRF-Token':s.csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});
 async function api(...args){const r=await request(...args),data=await r.json();return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const ok=async(...args)=>{const r=await api(...args);assert.ok(r.status<300,JSON.stringify(r.data));return r;};
 try{
  await ok('/api/auth/bootstrap',{setupKey:process.env.ADMIN_TOKEN,name:'Gestor',username:'gestor',password:'senha-selecao-gestor'});const m=await ok('/api/auth/management/login',{username:'gestor',password:'senha-selecao-gestor'}),master={cookie:m.cookie,csrf:m.data.csrf};
  async function shop(slug){await ok('/api/platform/tenants',{name:'Floricultura '+slug,slug,ownerName:'Responsável '+slug,username:slug,password:'senha-selecao-loja',profile:{city:'Mauá',state:'SP',deliveryCities:['Mauá'],deliveryFee:2000}},master);const r=await ok('/api/auth/login',{username:slug,password:'senha-selecao-loja'});return {cookie:r.cookie,csrf:r.data.csrf};}
  const a=await shop('selecao-a'),b=await shop('selecao-b'),client=async(name,phone,s=a)=>(await ok('/api/admin/customers',{name,phone},s)).data;
  const c1=await client('Ana d’Ávila','11988881111'),c2=await client('Bruna Flores','11988882222'),foreign=await client('Cliente de outra loja','11988883333',b);
  const address={label:'Casa',zipCode:'09370670',street:'Rua das Flores',number:'123',neighborhood:'Centro',city:'Mauá',state:'SP',recipient:'Pessoa presenteada',recipientPhone:'11977771111',complement:'Casa 2',reference:'Portão azul'};
  const a1=(await ok('/api/admin/customers/'+c1.id+'/addresses',address,a)).data,a2=(await ok('/api/admin/customers/'+c2.id+'/addresses',{...address,street:'Rua do Jardim',number:'200',recipient:'Outra pessoa'},a)).data;
  const create=async(extra={})=>(await ok('/api/admin/orders',{customerId:c1.id,recipient:'Pessoa original',fulfillment:'pickup',scheduleMode:'now',paymentMethod:'pix',items:[{id:1,quantity:1}],salesChannel:'pdv',...extra},a)).data;
  let pickup=await create(),path='/api/admin/orders/'+pickup.id;
  const selection={action:'selection',field:'customer',version:pickup.version,customerId:c2.id};
  assert.equal((await api(path,selection,undefined,'PATCH')).status,401);
  assert.equal((await api(path,{...selection,customerId:foreign.id},a,'PATCH')).status,404);
  assert.equal((await api(path,{...selection,customer:'Nome forjado'},a,'PATCH')).status,400);
  pickup=(await ok(path,selection,a,'PATCH')).data;assert.equal(pickup.customer,c2.name);assert.equal(pickup.phone,c2.phone);assert.equal(pickup.customerId,c2.id);assert.equal(pickup.recipient,'Pessoa original');assert.equal((await api(path,selection,a,'PATCH')).status,409);
  const event=(await ok(path+'/events',undefined,a)).data.events[0];assert.equal(event.actor,'Responsável selecao-a');assert.ok(event.actorId);for(const field of ['customerId','customer','phone'])assert.ok(event.changes.some(c=>c.field===field));
  let delivery=await create({fulfillment:'delivery',deliveryAddressId:a1.id,deliveryAddressVersion:a1.version});path='/api/admin/orders/'+delivery.id;const originalFee=delivery.shippingFee,total=delivery.total;
  assert.equal((await api(path,{...selection,version:delivery.version},a,'PATCH')).status,400);
  assert.equal((await api(path,{...selection,version:delivery.version,addressId:a1.id,addressVersion:a1.version},a,'PATCH')).status,404);
  delivery=(await ok(path,{...selection,version:delivery.version,addressId:a2.id,addressVersion:a2.version},a,'PATCH')).data;
  assert.equal(delivery.customerId,c2.id);assert.equal(delivery.recipient,a2.recipient);assert.equal(delivery.recipientPhone,a2.recipientPhone);assert.equal(delivery.deliveryAddress.id,a2.id);assert.equal(delivery.deliveryReference,'Portão azul');assert.equal(delivery.total,total);assert.equal(delivery.shippingFee,originalFee);
  const editedAddress=(await ok('/api/admin/customers/'+c2.id+'/addresses/'+a2.id,{...address,street:'Rua atualizada',version:a2.version},a,'PATCH')).data;
  const addressSelection={action:'selection',field:'address',version:delivery.version,customerId:c2.id,addressId:a2.id,addressVersion:a2.version};
  assert.equal((await api(path,addressSelection,a,'PATCH')).status,409);
  delivery=(await ok(path,{...addressSelection,addressVersion:editedAddress.version},a,'PATCH')).data;assert.equal(delivery.deliveryAddress.street,'Rua atualizada');assert.match(delivery.address,/Rua atualizada/);
  assert.equal((await api(path,{...addressSelection,version:delivery.version,customerId:c1.id,addressId:a1.id},a,'PATCH')).status,400);
  const formula=await create({customerId:undefined,customer:'=SUM(1,1)',fulfillment:'store'}),ids=[delivery.id,formula.id];
  for(const format of ['xls','pdf','word']){
   const r=await request('/api/admin/orders/export',{format,ids},a);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');const buffer=Buffer.from(await r.arrayBuffer());
   if(format==='xls'){
    assert.match(r.headers.get('content-type'),/application\/vnd.ms-excel/);assert.match(r.headers.get('content-disposition'),/\.xls"/);assert.equal(buffer.subarray(0,8).toString('hex'),'d0cf11e0a1b11ae1');
    const XLS=require('@e965/xlsx'),book=XLS.read(buffer,{type:'buffer'}),sheet=book.Sheets.Pedidos;assert.equal(sheet.B2.v,c2.name);assert.equal(sheet.B3.v,'=SUM(1,1)');assert.equal(sheet.B3.t,'s');assert.equal(sheet.B3.f,undefined);assert.equal(sheet.L2.t,'n');assert.equal(sheet.L2.v,delivery.total/100);
   }else if(format==='pdf'){assert.match(r.headers.get('content-type'),/application\/pdf/);assert.equal(buffer.subarray(0,5).toString(),'%PDF-');assert.equal((buffer.toString('latin1').match(/\/Type \/Page\b/g)||[]).length,1);assert.match(buffer.toString('latin1'),/FontFile2/);}
   else{assert.match(r.headers.get('content-disposition'),/\.docx"/);assert.equal(buffer.subarray(0,2).toString(),'PK');const zip=await require('jszip').loadAsync(buffer),xml=await zip.file('word/document.xml').async('string');assert.ok(xml.includes('Bruna Flores'));assert.ok(xml.includes('Pagamento'));assert.ok(xml.includes('=SUM(1,1)'));}
  }
  assert.equal((await request('/api/admin/orders/export',{format:'xls',ids},b)).status,404);
  assert.equal((await request('/api/admin/orders/export',{format:'xls',ids},undefined)).status,401);
  assert.equal((await request('/api/admin/orders/export',{format:'xls',ids:[]},a)).status,400);
  assert.equal((await request('/api/admin/orders/export',{format:'csv',ids},a)).status,400);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('PDF pagina uma seleção extensa com cabeçalho repetido e Word permanece um documento válido',async()=>{
 const orders=Array.from({length:140},(_,i)=>({id:require('node:crypto').randomUUID(),customer:'Cliente '+i,recipient:'Destinatário',date:'2026-11-01',period:'Tarde',timeSlot:'13:40 - 15:50',fulfillment:'delivery',city:'Mauá',status:'Aguardando preparação',paymentMethod:'pix',total:12900}));
 const pdf=await require('../order-export').pdf(orders,'Emoções Flores');assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length>3);
});
