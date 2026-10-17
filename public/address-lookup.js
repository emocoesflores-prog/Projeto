/* Consulta com cancelamento: respostas antigas nunca sobrescrevem outro cadastro. */
window.AddressLookup={attach(form,{endpoint,headers,status}){
 let sequence=0,timer,controller;
 const fields=['address','neighborhood','city','state'];
 function cancel(){sequence++;clearTimeout(timer);controller?.abort();status.textContent='';}
 async function lookup(){const zip=form.elements.zipCode.value.replace(/\D/g,''),ticket=++sequence;controller?.abort();if(zip.length!==8)return;
  controller=new AbortController();const before=Object.fromEntries(fields.map(k=>[k,form.elements[k].value]));status.textContent='Consultando CEP…';
  try{const response=await fetch(endpoint+zip,{headers:headers(),signal:controller.signal,cache:'no-store'}),data=await response.json();if(ticket!==sequence||form.elements.zipCode.value.replace(/\D/g,'')!==zip)return;if(!response.ok)throw Error(data.error||'Não foi possível consultar o CEP.');
   for(const key of fields)if(form.elements[key].value===before[key])form.elements[key].value=data[key==='address'?'street':key]||'';
   status.textContent='Endereço localizado. Confira os dados e informe o número.';
  }catch(e){if(e.name!=='AbortError'&&ticket===sequence)status.textContent=e.message+' Você pode preencher manualmente.';}
 }
 form.elements.zipCode.addEventListener('input',()=>{cancel();if(form.elements.zipCode.value.replace(/\D/g,'').length===8)timer=setTimeout(lookup,300)});
 return {cancel};
}};
