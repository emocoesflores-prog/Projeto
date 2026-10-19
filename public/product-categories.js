(function(root){
 const labels=p=>Array.isArray(p.categories)&&p.categories.length?p.categories:[p.category].filter(Boolean);
 const has=(p,label)=>labels(p).includes(label);
 const api={labels,has};if(typeof module==='object')module.exports=api;else root.ProductCategories=api;
})(globalThis);
