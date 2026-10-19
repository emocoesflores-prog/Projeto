window.CheckoutQuote=class{
 constructor({url,headers=()=>({}),onState}){this.url=url;this.headers=headers;this.onState=onState;this.key='';this.sequence=0;this.timer=null;this.current=null;}
 ensure(payload){const key=JSON.stringify(payload);if(key===this.key){this.onState(this.current);return;}clearTimeout(this.timer);this.key=key;this.current={pending:true};const ticket=++this.sequence;this.onState(this.current);if(!payload.items.length){this.current=null;return;}this.timer=setTimeout(()=>this.fetch(payload,ticket).catch(()=>{}),300);}
 async fetch(payload,ticket){try{const response=await fetch(this.url(),{method:'POST',headers:{...this.headers(),'Content-Type':'application/json'},body:JSON.stringify(payload)}),data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível calcular o total.');if(ticket===this.sequence){this.current={data};this.onState(this.current);}return data;}catch(e){if(ticket===this.sequence){this.current={error:e.message};this.onState(this.current);}throw e;}}
 async latest(payload){clearTimeout(this.timer);this.key=JSON.stringify(payload);const ticket=++this.sequence;return this.fetch(payload,ticket);}
 reset(){clearTimeout(this.timer);this.sequence++;this.key='';this.current=null;}
};
