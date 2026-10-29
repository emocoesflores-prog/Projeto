const {randomUUID}=require('node:crypto');
const {z}=require('zod');
const {coord}=require('./shop-operations');
const {OrderError}=require('./order-domain');
const inputSchema=z.object({origin:coord,stops:z.array(z.object({orderId:z.uuid(),location:coord}).strict()).min(1).max(25),start:z.string().datetime({offset:true})}).strict();
function distance(a,b){const rad=x=>x*Math.PI/180,dlat=rad(b.lat-a.lat),dlng=rad(b.lng-a.lng);return 6371*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlng/2)**2)));}
async function request(path,key,body){const r=await fetch('https://api.openrouteservice.org'+path,{method:body?'POST':'GET',headers:{Authorization:key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw new OrderError('O serviço de rotas não respondeu. Confira a configuração e tente novamente.',502);return r.json();}
async function plan(input,orders,{key='',serviceMinutes=5,estimatedSpeed=30,now=new Date()}={}){
 const p=inputSchema.safeParse(input);if(!p.success)throw new OrderError('Informe origem, localização de cada parada e início da rota.',400);
 const d=p.data;if(new Set(d.stops.map(s=>s.orderId)).size!==d.stops.length)throw new OrderError('Não repita pedidos na rota.',400);
 if(new Date(d.start)<new Date(now.getTime()-5*60000))throw new OrderError('Escolha um início de rota atual ou futuro.',400);
 const selected=d.stops.map(s=>{const o=orders.find(o=>o.id===s.orderId);if(!o||o.status!=='Pronto'||o.paymentStatus!=='paid'||o.fulfillment!=='delivery')throw new OrderError('Selecione somente pedidos pagos e prontos desta loja.',409);return {...s,order:o};});
 if(new Set(selected.map(s=>s.order.date)).size!==1)throw new OrderError('Crie uma rota para cada dia de entrega.',400);
 if(require('./public/order-options').localDate(new Date(d.start))!==selected[0].order.date)throw new OrderError('O início deve corresponder ao dia de entrega dos pedidos.',400);
 const points=[d.origin,...selected.map(s=>s.location)];let matrix;
 if(key)matrix=await request('/v2/matrix/driving-car',key,{locations:points.map(p=>[p.lng,p.lat]),metrics:['duration','distance']});
 const pending=selected.map((s,i)=>({...s,index:i+1})),stops=[];let point=d.origin,index=0,clock=new Date(d.start).getTime(),km=0,seconds=0;
 while(pending.length){
  const deadline=s=>s.order.timeSlot?.slice(-5)||(s.order.period==='Manhã'?'12:00':'18:00');
  pending.sort((a,b)=>deadline(a).localeCompare(deadline(b))||((matrix?.durations[index]?.[a.index]??distance(point,a.location)*3600/estimatedSpeed)-(matrix?.durations[index]?.[b.index]??distance(point,b.location)*3600/estimatedSpeed)));
  const next=pending.shift(),meters=key?matrix.distances[index]?.[next.index]:distance(point,next.location)*1000,travel=key?matrix.durations[index]?.[next.index]:meters/1000*3600/estimatedSpeed;
  if(!Number.isFinite(meters)||!Number.isFinite(travel))throw new OrderError('Uma parada não possui caminho acessível para carro. Revise a localização.',400);
  km+=meters/1000;seconds+=travel;clock+=travel*1000;
  const startTime=next.order.timeSlot?.slice(0,5)||(next.order.period==='Manhã'?'08:00':'12:00');clock=Math.max(clock,new Date(next.order.date+'T'+startTime+':00-03:00').getTime());
  const late=clock>new Date(next.order.date+'T'+deadline(next)+':00-03:00').getTime();
  stops.push({orderId:next.order.id,orderVersion:next.order.version,customer:next.order.customer,recipient:next.order.recipient,phone:next.order.recipientPhone||next.order.phone,address:next.order.address,city:next.order.city,window:next.order.timeSlot||next.order.period,location:next.location,estimatedArrival:new Date(clock).toISOString(),late});
  clock+=serviceMinutes*60000;point=next.location;index=next.index;
 }
 let geometry=null;
 if(key){const result=await request('/v2/directions/driving-car/geojson',key,{coordinates:[d.origin,...stops.map(s=>s.location)].map(p=>[p.lng,p.lat])});geometry=result.features?.[0]?.geometry||null;}
 return {planId:randomUUID(),origin:d.origin,start:d.start,stops,km:Math.round(km*100)/100,travelMinutes:Math.ceil(seconds/60),estimatedFinish:new Date(clock).toISOString(),method:key?'road':'straight-line',geometry,warnings:[...(key?['Estimativa rodoviária sem trânsito em tempo real.']:[`Distâncias em linha reta, velocidade estimada de ${estimatedSpeed} km/h. Revise o percurso antes de despachar.`]),...(stops.some(s=>s.late)?['Há parada com chegada estimada fora do período contratado. Ajuste o início, a rota ou o entregador.']:[])],createdAt:now.toISOString()};
}
async function geocode(query,key){if(!key)throw new OrderError('Configure ORS_API_KEY no servidor para pesquisar endereços e calcular distâncias rodoviárias.',400);if(typeof query!=='string'||query.trim().length<10||query.length>500)throw new OrderError('Informe um endereço completo.',400);const result=await request('/geocode/search?text='+encodeURIComponent(query)+'&boundary.country=BRA&size=5',key);return (result.features||[]).map(f=>({label:f.properties.label,confidence:f.properties.confidence,location:{lat:f.geometry.coordinates[1],lng:f.geometry.coordinates[0]}}));}
async function quoteDistance(settings,address,key){const options=settings.distance;if(!options?.enabled)return null;if(!key||!options.origin)throw new OrderError('A cobrança por distância está temporariamente indisponível. Consulte a loja.',503);const matches=await geocode(address,key);if(!matches.length||matches[0].confidence<0.85)throw new OrderError('Não foi possível localizar o endereço com segurança. Confira rua, número, cidade e CEP.',400);const result=await request('/v2/directions/driving-car/geojson',key,{coordinates:[[options.origin.lng,options.origin.lat],[matches[0].location.lng,matches[0].location.lat]]});const km=result.features?.[0]?.properties?.summary?.distance/1000;if(!Number.isFinite(km)||km>options.maxKm)throw new OrderError('Endereço fora da distância de entrega atendida.',400);return {km,fee:Math.max(options.minFee,options.baseFee+Math.ceil(km*options.perKm)),method:'road',address:matches[0].label};}
module.exports={plan,geocode,quoteDistance,distance};
