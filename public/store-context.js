window.StoreContext={
 slug:document.querySelector('meta[name=store-slug]')?.content||(location.pathname.startsWith('/loja/')?location.pathname.split('/')[2]:null),
 base(slug){const meta=document.querySelector('meta[name=store-base]');return meta?meta.content:slug?'/loja/'+encodeURIComponent(slug):'';}
};
