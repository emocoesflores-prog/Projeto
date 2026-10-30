/* Um fluxo autenticado por painel; reconectar sempre reconcilia os dados. */
window.OrderLive=(()=>{
 let generation=0,controller=null,timer=null,config,online=false;
 function state(value){online=value;document.dispatchEvent(new CustomEvent('order-live-state',{detail:{online:value}}));}
 function stop(){generation++;controller?.abort();clearTimeout(timer);state(false);}
 function start(options){stop();config=options;const epoch=generation;let delay=500;
  async function connect(){if(epoch!==generation)return;controller=new AbortController();try{
   const r=await fetch('/api/admin/events',{headers:config.auth(),cache:'no-store',signal:controller.signal});
   if(!r.ok||!r.body)throw Error('Fluxo indisponível');state(true);delay=500;
   const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='';
   while(epoch===generation){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);const data=block.split('\n').find(s=>s.startsWith('data: '));if(data){const event=JSON.parse(data.slice(6));config.change(event);}}}
  }catch(e){if(epoch!==generation)return;}finally{if(epoch===generation){state(false);timer=setTimeout(connect,delay);delay=Math.min(delay*2,10000);}}}
  connect();
 }
 return {start,stop,get online(){return online;}};
})();
