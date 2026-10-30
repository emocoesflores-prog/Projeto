/* Notificações locais após confirmação da gravação. Sem dados de cliente no evento. */
function createRealtime(){
 const shops=new Map();
 function group(id){if(!shops.has(id))shops.set(id,{revision:0,listeners:new Set()});return shops.get(id);}
 return {
  publish(id,topics=['orders','operations']){const g=group(id),event={revision:++g.revision,topics};for(const fn of g.listeners){try{fn(event);}catch{}}},
  subscribe(id,fn){const g=group(id);g.listeners.add(fn);return()=>g.listeners.delete(fn);},
  stream(req,res,id){
   res.set({'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
   let closed=false,pending=Promise.resolve();
   const send=event=>{pending=pending.then(async()=>{if(closed)return;if(req.validateSession&&!await req.validateSession())return res.end();if(!res.write('data: '+JSON.stringify(event)+'\n\n'))res.end();}).catch(()=>res.end());};
   const off=this.subscribe(id,send);send({revision:group(id).revision,topics:['sync']});
   const heartbeat=setInterval(()=>{pending=pending.then(async()=>{if(closed)return;if(req.validateSession&&!await req.validateSession())return res.end();res.write(': keepalive\n\n');}).catch(()=>res.end());},15000);heartbeat.unref?.();
   res.on('close',()=>{closed=true;off();clearInterval(heartbeat);});
  }
 };
}
module.exports={createRealtime};
