window.ProductArt=(()=>{
 const byId={1:'aurora',2:'rosas',3:'sunflowers',4:'orchid',5:'basket',6:'gift'};
 function path(p){if(typeof p.image==='string'&&(/^\/product-art\/[a-z-]+\.svg$/.test(p.image)||/^\/media\/[a-z0-9-]+\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(p.image)))return p.image;const category=String(p.category||'').toLowerCase();return '/product-art/'+(category.includes('cesta')?'basket':category.includes('planta')?'orchid':category.includes('rosa')?'rosas':byId[p.id]||'aurora')+'.svg';}
 function url(src){return src?.startsWith('/media/')?src+'?v=3.5.0':src;}
 function image(p){const img=document.createElement('img');img.src=url(path(p));img.alt=(p.image?.startsWith('/media/')?'':'Ilustração de ')+p.name;img.loading='lazy';img.decoding='async';img.width=400;img.height=420;return img;}
 function mount(target,p){target.replaceChildren(image(p));target.classList.add('illustrated-product');}
 return {path,image,mount,url};
})();
