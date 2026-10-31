/* O conteúdo do rascunho fica no servidor; nenhuma informação de cliente em localStorage. */
(function(root){
 function create({auth,onState=()=>{}}){
  let record=null,pending=null,task=null,timer,epoch=0,error=null;
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  async function request(path,body,method='GET',keepalive=false){
   const r=await fetch('/api/admin/pdv-drafts'+path,{method,cache:'no-store',keepalive,headers:{...auth(),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
   const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error||'Não foi possível salvar o rascunho.'),{status:r.status});return data;
  }
  const state=()=>onState({record,dirty:!!pending,saving:!!task,error});
  function use(value=null){epoch++;clearTimeout(timer);record=value||{id:crypto.randomUUID(),version:0,data:null};pending=null;task=null;error=null;state();return record;}
  async function flush(){
   clearTimeout(timer);if(task){await task;if(pending)return flush();return;}
   if(!record||!pending)return;
   const ticket=epoch,current=record,sent=pending,body={version:current.version,data:sent};error=null;
   task=(async()=>{let saved;try{saved=await request('/'+current.id,body,'PUT');}catch(e){
    // A resposta pode ter se perdido depois de gravar: conferir antes de declarar conflito.
    if(e.status===409){let remote;try{remote=await request('/'+current.id);}catch{throw e;}if(same(remote.data,sent))saved=remote;else throw e;}else throw e;
   }
   if(ticket!==epoch)return;record=saved;if(same(pending,sent))pending=null;
   })();state();
   try{await task;}catch(e){if(ticket===epoch)error=e;throw e;}finally{if(ticket===epoch){task=null;state();}}
   if(ticket===epoch&&pending)return flush();
  }
  function schedule(data){if(!record)use();const next=task||!same(record.data,data)?structuredClone(data):null;if(same(pending,next))return;pending=next;error=null;state();clearTimeout(timer);if(pending)timer=setTimeout(()=>flush().catch(()=>{}),450);}
  async function complete(){const ticket=epoch;await flush();if(ticket!==epoch)return;if(record?.version){await request('/'+record.id+'/complete',{version:record.version},'POST');}if(ticket===epoch)use();}
  async function discard(id,version){return request('/'+id,{version},'DELETE');}
  function reset(){epoch++;clearTimeout(timer);record=null;pending=null;task=null;error=null;}
  function beacon(){if(record&&pending&&!task)request('/'+record.id,{version:record.version,data:pending},'PUT',true).catch(()=>{});}
  return {use,schedule,flush,complete,discard,reset,beacon,list:()=>request(''),get:id=>request('/'+id),get current(){return record;},get unsaved(){return !!pending||!!task;},get error(){return error;}};
 }
 const api={create};if(typeof module==='object')module.exports=api;else root.POSDrafts=api;
})(globalThis);
