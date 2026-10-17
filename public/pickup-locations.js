(function(root){
 function format(p){return p.formattedAddress||p.legacyAddress||`${p.street}, ${p.number}${p.complement?', '+p.complement:''}, ${p.neighborhood}, ${p.city} - ${p.state}, CEP ${p.zipCode.slice(0,5)}-${p.zipCode.slice(5)}`;}
 function list(settings){return settings.pickupLocations||(settings.pickupAddress?[{id:'legacy',name:'Retirada principal',legacyAddress:settings.pickupAddress}]:[]);}
 function options(select,settings,snapshot){const points=list(settings),chosen=snapshot?.id||select.value;select.replaceChildren();if(points.length>1)select.add(new Option('Selecione o local de retirada',''));for(const p of points)select.add(new Option(p.name+' · '+format(p),p.id));if(snapshot&&!points.some(p=>p.id===snapshot.id))select.add(new Option(snapshot.name+' · '+format(snapshot),snapshot.id));if([...select.options].some(o=>o.value===chosen))select.value=chosen;select.required=points.length>1;}
 const api={format,list,options};if(typeof module==='object')module.exports=api;else root.PickupLocations=api;
})(globalThis);
