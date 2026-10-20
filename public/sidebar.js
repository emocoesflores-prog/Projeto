(()=>{
 const button=document.getElementById('sidebar-toggle');
 let expanded=window.innerWidth>760;try{const saved=localStorage.getItem('admin-menu');if(saved)expanded=saved==='expanded';}catch{}
 function render(){document.body.classList.toggle('sidebar-expanded',expanded);document.body.classList.toggle('sidebar-collapsed',!expanded);button.setAttribute('aria-expanded',String(expanded));button.setAttribute('aria-label',expanded?'Recolher menu':'Expandir menu');button.title=expanded?'Recolher menu':'Expandir menu';button.textContent=expanded?'«':'☰';}
 button.onclick=()=>{expanded=!expanded;render();try{localStorage.setItem('admin-menu',expanded?'expanded':'collapsed');}catch{}};
 for(const b of document.querySelectorAll('.sidebar [data-view]'))b.title=b.getAttribute('title')||b.querySelector('span')?.textContent||'';
 render();
})();
