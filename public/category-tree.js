(function(root){
 function path(categories,id){const byId=new Map(categories.map(c=>[c.id,c])),seen=new Set(),result=[];for(let c=byId.get(id);c;c=byId.get(c.parentId)){if(seen.has(c.id))throw Error('Uma categoria não pode ser superior de si mesma.');seen.add(c.id);result.unshift(c);if(c.parentId&&!byId.has(c.parentId))throw Error('Categoria superior não encontrada.');}return result;}
 const label=(categories,id)=>path(categories,id).map(c=>c.name).join(' › ');
 function expand(categories,ids){const result=new Set();for(const id of ids){const chain=path(categories,id);if(!chain.length||chain.length>3||chain.some(c=>!c.active))throw Error('Escolha categorias ativas nos três níveis desta floricultura.');for(const c of chain)result.add(c.id);}return [...result];}
 function validate(categories){for(const c of categories)if(path(categories,c.id).length>3)throw Error('São permitidos até três níveis: categoria, subcategoria e terceiro nível.');return true;}
 const api={path,label,expand,validate};if(typeof module==='object')module.exports=api;else root.CategoryTree=api;
})(globalThis);
