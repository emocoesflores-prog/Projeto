const cities=require('./data/cities-br.json');
const bundled=require('./data/neighborhoods-br.json');
const {normalize}=require('./public/delivery-rates');
const index=cities.map(c=>({...c,search:normalize(c.name)})),byId=new Map(cities.map(c=>[c.id,c]));
function searchCities(q='',state=''){
 const term=normalize(q);return index.filter(c=>!term||c.search.includes(term)).sort((a,b)=>(a.search===term?-1:0)-(b.search===term?-1:0)||(a.state===state?-1:0)-(b.state===state?-1:0)||a.name.localeCompare(b.name,'pt-BR')).slice(0,40).map(({search,...c})=>c);
}
function createLocalityService({fetcher=fetch,now=Date.now,seed=bundled}={}){
 const cache=new Map(),pending=new Map();
 const names=values=>[...new Map(values.filter(n=>typeof n==='string'&&n.trim().length>=2&&n.trim().length<=100).map(n=>[normalize(n),n.trim()])).values()].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 async function postal(city){
  const found=await Promise.allSettled(['Rua','Avenida'].map(async street=>{const url='https://viacep.com.br/ws/'+city.state+'/'+encodeURIComponent(city.name)+'/'+street+'/json/';const response=await fetcher(new URL(url),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(6000),redirect:'error'});if(!response.ok)throw Error();const rows=await response.json();if(!Array.isArray(rows))throw Error();return rows.filter(row=>String(row.ibge)===city.id&&row.uf===city.state&&normalize(row.localidade)===normalize(city.name)).map(row=>row.bairro);}));
  return names(found.flatMap(r=>r.status==='fulfilled'?r.value:[]));
 }
 async function osm(id){const query='[out:json][timeout:5];rel["boundary"="administrative"]["admin_level"="8"]["ref:IBGE"="'+id+'"];map_to_area->.city;(nwr["place"~"^(suburb|quarter|neighbourhood)$"](area.city);rel["boundary"="administrative"]["admin_level"="10"](area.city););out tags;';const url=new URL('https://overpass-api.de/api/interpreter');url.searchParams.set('data',query);const response=await fetcher(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(6500),redirect:'error'});if(!response.ok)throw Error();const data=await response.json();if(!Array.isArray(data.elements))throw Error();return names(data.elements.map(item=>item.tags?.name));}
 async function neighborhoods(id){
  if(!byId.has(id))throw Object.assign(Error('Selecione uma cidade válida.'),{status:400});
  const city=byId.get(id);
  if(seed[id]?.neighborhoods?.length)return {city,neighborhoods:names(seed[id].neighborhoods),source:'ViaCEP · base local',checkedAt:seed[id].checkedAt,complete:false,unavailable:false,message:'Sugestões de bairros por CEP. Se não encontrar o bairro, digite o nome manualmente.'};
  const saved=cache.get(id);if(saved&&saved.until>now())return saved.data;if(pending.has(id))return pending.get(id);
  const job=(async()=>{let result;try{let values=await postal(city),source='ViaCEP';if(!values.length){values=await osm(id);source='OpenStreetMap';}if(!values.length)throw Error();result={city,neighborhoods:values,source,complete:false,unavailable:false,...(source==='OpenStreetMap'?{attribution:'© colaboradores do OpenStreetMap · ODbL'}:{}),message:'Sugestões de bairros. Se não encontrar o bairro, digite o nome manualmente.'};}catch{result={city,neighborhoods:[],source:'ViaCEP / OpenStreetMap',unavailable:true,complete:false,message:'Não foi possível consultar sugestões. Você pode digitar o bairro manualmente.'};}finally{pending.delete(id);}if(cache.size>=300)cache.delete(cache.keys().next().value);cache.set(id,{data:result,until:now()+(result.unavailable?60000:86400000)});return result;})();pending.set(id,job);return job;
 }
 return {searchCities,neighborhoods};
}
module.exports={createLocalityService,searchCities,byId};
