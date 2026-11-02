const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createOutboundCare,validateFirstContact,withinHours,defaults}=require('../outbound-care');
function virtual(settings={}){let stamp=Date.parse('2026-11-02T15:00:00Z');const sleeps=[];const policy=createOutboundCare({now:()=>stamp,random:(min)=>min,getSettings:async()=>({...defaults,...settings}),sleep:async ms=>{sleeps.push(ms);stamp+=ms;}});return {policy,sleeps,now:()=>stamp};}
test('atendentes em clientes diferentes compartilham FIFO, nunca sobrepõem envios e respeitam intervalo',async()=>{
 const {policy,now}=virtual(),sent=[];let active=0,maximum=0;
 const tasks=['Ana → Juliana','Bruno → Pedro','Carla → Camila'].map(name=>policy.run({text:'Olá!'},async()=>{active++;maximum=Math.max(maximum,active);await Promise.resolve();sent.push({name,at:now()});active--;return name;}));
 assert.deepEqual(await Promise.all(tasks),['Ana → Juliana','Bruno → Pedro','Carla → Camila']);assert.equal(maximum,1);assert.equal(sent.length,3);assert.ok(sent[1].at-sent[0].at>=8000);assert.ok(sent[2].at-sent[1].at>=8000);assert.equal(policy.status().queued,0);
});
test('contas de lojas diferentes possuem filas independentes',async()=>{
 const a=virtual(),b=virtual();let release;const waiting=new Promise(resolve=>release=resolve),calls=[];
 const first=a.policy.run({text:''},async()=>{calls.push('loja A');await waiting;});await Promise.resolve();await Promise.resolve();
 await b.policy.run({text:''},async()=>calls.push('loja B'));assert.deepEqual(calls,['loja A','loja B']);release();await first;
});
test('digitação cresce com o texto, renova presença e para no teto de 60 segundos',async()=>{
 const short=virtual(),long=virtual();let composing=0,cleared=0;
 await short.policy.run({text:'Oi'},async()=>{});await long.policy.run({text:'Uma frase longa. '.repeat(100),typing:async()=>composing++,clearTyping:async()=>cleared++},async()=>{});
 assert.equal(short.sleeps.reduce((a,b)=>a+b,0),1000);assert.equal(long.sleeps.reduce((a,b)=>a+b,0),60000);assert.equal(composing,3);assert.equal(cleared,1);
});
test('limites de minuto e hora valem para o total dos atendentes',async()=>{
 const {policy,now}=virtual({perMinute:1,perHour:2}),times=[];await policy.run({},async()=>times.push(now()));await policy.run({},async()=>times.push(now()));assert.ok(times[1]-times[0]>=60000);
 await assert.rejects(policy.run({},async()=>assert.fail('não deve enviar')),error=>error.notSent&&error.status===429);
});
test('aviso do provedor pausa a fila e envio ambíguo não é repetido',async()=>{
 const {policy}=virtual();let attempts=0;await assert.rejects(policy.run({},async()=>{attempts++;throw Object.assign(Error('rate limit'),{status:429});}));await assert.rejects(policy.run({},async()=>attempts++),error=>error.notSent);assert.equal(attempts,1);assert.ok(policy.status().pausedUntil>0);
});
test('desconectar cancela mensagens ainda não transmitidas, inclusive as que aguardam sua vez',async()=>{
 let release;const pause=new Promise(resolve=>release=resolve),policy=createOutboundCare({sleep:async()=>pause,random:min=>min}),sent=[];
 const first=policy.run({text:'Oi'},async()=>sent.push(1)),second=policy.run({text:'Oi'},async()=>sent.push(2));const results=Promise.allSettled([first,second]);await new Promise(setImmediate);policy.cancel();release();const values=await results;assert.equal(values.length,2);assert.ok(values.every(value=>value.status==='rejected'&&value.reason.notSent));assert.deepEqual(sent,[]);
});
test('janelas de atendimento usam São Paulo e comportam turnos que passam da meia-noite',()=>{
 const settings={hoursEnabled:true,start:'07:00',end:'22:00'};assert.equal(withinHours(Date.parse('2026-11-03T00:59:00Z'),settings),true);assert.equal(withinHours(Date.parse('2026-11-03T01:00:00Z'),settings),false);assert.equal(withinHours(Date.parse('2026-11-03T02:00:00Z'),{...settings,start:'22:00',end:'07:00'}),true);
});
test('primeiro contato não leva links; resposta solicitada admite catálogo, inclusive com mídia recebida',()=>{
 for(const text of ['Veja https://exemplo.com','Acesse bit.ly/teste','www.loja.com','inovafacil.com.br/loja'])assert.throws(()=>validateFirstContact(text,[]),error=>error.notSent&&error.status===422);
 assert.doesNotThrow(()=>validateFirstContact('Olá, como posso ajudar?',[]));assert.doesNotThrow(()=>validateFirstContact('https://loja.com',[{fromMe:false,hasMedia:true}]));assert.throws(()=>validateFirstContact('https://loja.com',[{fromMe:true,body:'Olá'}]));
});
test('estado da fila persiste na conversa e envio comprovadamente não transmitido pode ser tentado de novo',async()=>{
 const store=require('../conversation-store').createStore({demo:true}),tenant=randomUUID(),id='5511999999999@c.us',actor={id:randomUUID(),name:'Ana',role:'owner'},operationId=randomUUID(),fingerprint='c'.repeat(64);
 await store.mutate(tenant,'whatsapp',id,{action:'claim',version:0},actor,{team:[{...actor,active:true}]});await store.beginSend(tenant,'whatsapp',id,{operationId,fingerprint},actor);
 assert.equal((await store.sendStatus(tenant,'whatsapp',id,operationId)).state,'sending');assert.equal((await store.outbox(tenant)).length,1);assert.equal((await store.outbox(randomUUID())).length,0);assert.equal(await store.sendStatus(randomUUID(),'whatsapp',id,operationId),null);
 await store.endSend(tenant,'whatsapp',id,operationId,{notSent:true},true);assert.equal((await store.sendStatus(tenant,'whatsapp',id,operationId)).state,'not_sent');await store.beginSend(tenant,'whatsapp',id,{operationId,fingerprint},actor);await store.endSend(tenant,'whatsapp',id,operationId,{id:'confirmed'});assert.equal((await store.sendStatus(tenant,'whatsapp',id,operationId)).id,'confirmed');assert.equal((await store.outbox(tenant)).length,0);
});

test('limitação HTTP do provedor preserva Retry-After e não expõe a resposta privada',async()=>{
 const {jsonFetch}=require('../channel-oauth');const response=new Response(JSON.stringify({error:{code:4,message:'token privado não deve aparecer'}}),{status:429,headers:{'Retry-After':'900'}});let limited;try{await jsonFetch('https://provedor.example',{},async()=>response);}catch(error){limited=error;}assert.equal(limited.status,429);assert.equal(limited.retryAfterMs,900000);assert.doesNotMatch(limited.message,/privado/);const {policy,now}=virtual();await assert.rejects(policy.run({},async()=>{throw limited;}));assert.equal(policy.status().pausedUntil-now(),900000);
});
