/* O servidor recebe apenas a seleção; os dados são lidos da loja autenticada. */
window.OrderExport=(()=>{
 let dialog=null,controller=null;
 function close(){controller?.abort();controller=null;dialog?.close();dialog?.remove();dialog=null;}
 function open({auth,orders}){
  close();const selected=orders.map(o=>o.id),d=document.createElement('dialog');dialog=d;d.className='export-format-dialog';d.setAttribute('aria-label','Exportar pedidos');
  const title=document.createElement('h2');title.textContent='Exportar pedidos';const caption=document.createElement('p');caption.textContent=selected.length+' pedido(s) da lista filtrada';const options=document.createElement('div');options.className='export-format-options';const result=document.createElement('p');result.setAttribute('role','status');result.className='export-format-result';
  const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent='Cancelar';cancel.onclick=close;
  for(const [format,label,description,icon]of [['xls','Excel','Planilha .xls','grid'],['pdf','PDF','Documento .pdf','receipt'],['word','Word','Documento .docx','clipboard']]){
   const b=document.createElement('button');b.type='button';b.className='export-format-option format-'+format;b.dataset.exportFormat=format;b.append(UIIcons.icon(icon));const copy=document.createElement('span'),name=document.createElement('strong'),small=document.createElement('small');name.textContent=label;small.textContent=description;copy.append(name,small);b.append(copy);b.disabled=!selected.length||selected.length>1000;
   b.onclick=async()=>{const current=dialog;controller=new AbortController();for(const option of options.children)option.disabled=true;result.textContent='Preparando arquivo…';try{
    const r=await fetch('/api/admin/orders/export',{method:'POST',headers:{...auth(),'Content-Type':'application/json'},body:JSON.stringify({format,ids:selected}),signal:controller.signal});
    if(!r.ok){let data;try{data=await r.json();}catch{}throw Error(data?.error||'Não foi possível gerar o arquivo.');}
    const blob=await r.blob();if(dialog!==current)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=r.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1]||'pedidos.'+(format==='word'?'docx':format);document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);close();
   }catch(error){if(error.name!=='AbortError'&&dialog===current)result.textContent=error.message;for(const option of options.children)option.disabled=false;}};options.append(b);
  }
  if(!selected.length)result.textContent='Não há pedidos nesta seleção.';else if(selected.length>1000)result.textContent='Refine os filtros para exportar até 1.000 pedidos por arquivo.';
  d.append(title,caption,options,result,cancel);d.addEventListener('cancel',e=>{e.preventDefault();close();});document.body.append(d);d.showModal();
 }
 return {open,reset:close};
})();
