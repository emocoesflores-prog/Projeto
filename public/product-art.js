window.ProductArt=(()=>{
 const byId={1:'aurora',2:'rosas',3:'sunflowers',4:'orchid',5:'basket',6:'gift'};
 function path(p){if(typeof p.image==='string'&&/^\/product-art\/[a-z-]+\.svg$/.test(p.image))return p.image;const category=String(p.category||'').toLowerCase();return '/product-art/'+(category.includes('cesta')?'basket':category.includes('planta')?'orchid':category.includes('rosa')?'rosas':byId[p.id]||'aurora')+'.svg';}
 function image(p){const img=document.createElement('img');img.src=path(p);img.alt='Ilustração de '+p.name;img.loading='lazy';img.decoding='async';img.width=400;img.height=420;return img;}
 function mount(target,p){target.replaceChildren(image(p));target.classList.add('illustrated-product');}
 return {path,image,mount};
})();
