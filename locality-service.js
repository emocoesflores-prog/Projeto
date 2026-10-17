const cities=require('./data/cities-br.json');
const {normalize}=require('./public/delivery-rates');
const index=cities.map(c=>({...c,search:normalize(c.name)})),byId=new Map(cities.map(c=>[c.id,c]));
function searchCities(q='',state=''){
 const term=normalize(q);return index.filter(c=>!term||c.search.includes(term)).sort((a,b)=>(a.search===term?-1:0)-(b.search===term?-1:0)||(a.state===state?-1:0)-(b.state===state?-1:0)||a.name.localeCompare(b.name,'pt-BR')).slice(0,40).map(({search,...c})=>c);
}
function createLocalityService({fetcher=fetch,now=Date.now}={}){
 const cache=new Map(),pending=new Map();
 async function neighborhoods(id){
  if(!byId.has(id))throw Object.assign(Error('Selecione uma cidade válida.'),{status:400});
  const saved=cache.get(id);if(saved&&saved.until>now())return saved.data;if(pending.has(id))return pending.get(id);
  const job=(async()=>{try{
   const query='[out:json][timeout:12];rel["boundary"="administrative"]["admin_level"="8"]["ref:IBGE"="'+id+'"];map_to_area->.city;(nwr["place"~"^(suburb|quarter|neighbourhood)$"](area.city);rel["boundary"="administrative"]["admin_level"="10"](area.city););out tags;';
   const url=new URL('https://overpass-api.de/api/interpreter');url.searchParams.set('data',query);
   const response=await fetcher(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000),redirect:'error'});if(!response.ok)throw Error();const data=await response.json();if(!Array.isArray(data.elements))throw Error();
   const names=new Map();for(const item of data.elements){const name=item.tags?.name;if(typeof name==='string'&&name.trim().length>=2&&name.length<=100)names.set(normalize(name),name.trim());}
   const result={city:byId.get(id),neighborhoods:[...names.values()].sort((a,b)=>a.localeCompare(b,'pt-BR')),source:'OpenStreetMap',attribution:'© colaboradores do OpenStreetMap · ODbL',unavailable:false};
   if(cache.size>=300)cache.delete(cache.keys().next().value);cache.set(id,{data:result,until:now()+86400000});return result;
  }catch{const data={city:byId.get(id),neighborhoods:[],source:'OpenStreetMap',unavailable:true,message:'A lista de bairros está indisponível agora. Você pode digitar o bairro manualmente.'};if(cache.size>=300)cache.delete(cache.keys().next().value);cache.set(id,{data,until:now()+60000});return data;}finally{pending.delete(id);}})();pending.set(id,job);return job;
 }
 return {searchCities,neighborhoods};
}
module.exports={createLocalityService,searchCities,byId};
