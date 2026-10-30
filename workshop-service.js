const {context,policy}=require('./tenant-context');
function createWorkshopService({platformStore,orders,printers,clock=()=>new Date(),interval=1000,onChanged=()=>{}}={}){let timer=null,running=null;const states=new Map();
 function status(id){return states.get(id)||{checkedAt:null,started:0,error:null};}
 function tick(){if(running)return running;running=(async()=>{const tenants=await platformStore.workshopTenants();if(!tenants.length)return;let proof=await printers.inspect({fresh:false});for(const t of tenants){try{if(+clock()-Date.parse(proof.checkedAt)>10000)proof=await printers.inspect({fresh:false});const result=await context.run(policy(t),()=>platformStore.advanceWorkshop(t.id,{now:clock(),printerProof:proof,demoOrders:orders}));const previous=status(t.id).error;states.set(t.id,{checkedAt:clock().toISOString(),started:result.orders.length,error:result.blocked});if(result.orders.length||previous!==result.blocked)onChanged(t.id);}catch{states.set(t.id,{checkedAt:clock().toISOString(),started:0,error:'Não foi possível liberar os pedidos. A próxima verificação tentará novamente.'});}}})().catch(()=>{}).finally(()=>{running=null;});return running;}
 return {status,tick,start(){if(timer)return;timer=setInterval(tick,interval);timer.unref?.();tick();},async stop(){clearInterval(timer);timer=null;if(running)await running;}};
}
module.exports={createWorkshopService};
