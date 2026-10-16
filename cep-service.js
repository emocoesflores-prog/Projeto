const {OrderError}=require('./order-domain');
function createCepService(fetcher=fetch){
 const cache=new Map();
 return async function lookup(value){
  if(!/^\d{8}$/.test(value))throw new OrderError('Informe um CEP com 8 dígitos.',400);
  const saved=cache.get(value);if(saved&&saved.until>Date.now())return {...saved.data};
  let response,data;
  try{response=await fetcher(`https://viacep.com.br/ws/${value}/json/`,{signal:AbortSignal.timeout(6000),headers:{Accept:'application/json'},redirect:'error'});if(!response.ok)throw Error();data=await response.json()}
  catch{throw new OrderError('Não foi possível consultar o CEP agora. Tente novamente ou preencha o endereço manualmente.',503)}
  if(data.erro)throw new OrderError('CEP não encontrado. Confira os dígitos ou informe o endereço manualmente.',404);
  if(typeof data.logradouro!=='string'||typeof data.bairro!=='string'||typeof data.localidade!=='string'||typeof data.uf!=='string')throw new OrderError('O serviço de CEP retornou dados incompletos. Preencha o endereço manualmente.',503);
  const result={zipCode:value,street:data.logradouro,neighborhood:data.bairro,city:data.localidade,state:data.uf};
  if(cache.size>=500)cache.delete(cache.keys().next().value);
  cache.set(value,{data:result,until:Date.now()+3600000});return {...result};
 };
}
module.exports={createCepService};
