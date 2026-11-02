const {randomInt}=require('node:crypto');
const {setTimeout:wait}=require('node:timers/promises');
const {z}=require('zod');
const defaults={minInterval:8,maxInterval:25,perMinute:6,perHour:120,hoursEnabled:false,start:'07:00',end:'22:00',readReceipts:true};
const settingsSchema=z.object({minInterval:z.number().int().min(8).max(120),maxInterval:z.number().int().min(8).max(300),perMinute:z.number().int().min(1).max(6),perHour:z.number().int().min(1).max(120),hoursEnabled:z.boolean(),start:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),end:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),readReceipts:z.boolean()}).strict().refine(s=>s.maxInterval>=s.minInterval,'O intervalo máximo deve ser maior ou igual ao mínimo.').refine(s=>!s.hoursEnabled||s.start!==s.end,'Escolha horários de início e fim diferentes.');
function withinHours(timestamp,settings){if(!settings.hoursEnabled)return true;const current=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(timestamp));return settings.start<settings.end?current>=settings.start&&current<settings.end:current>=settings.start||current<settings.end;}
const refusal=(message,status=429)=>Object.assign(new Error(message),{status,publicError:true,notSent:true});
const hasLink=text=>/(?:https?:\/\/|www\.|(?<![@\w])(?:bit\.ly|tinyurl\.com|t\.co|cutt\.ly|shorturl\.at|wa\.me|[a-z0-9-]+\.(?:com(?:\.br)?|net|org|app|link|store|shop|io|me|ly))\b)/i.test(String(text||''));
function validateFirstContact(text,messages){
 if(hasLink(text)&&!messages.some(m=>!m.fromMe&&m.type!=='revoked'))throw refusal('Antes de enviar links, apresente-se e aguarde uma resposta do cliente. No primeiro contato, envie uma mensagem sem links.',422);
}
function createOutboundCare({now=Date.now,random=randomInt,sleep=wait,getSettings=async()=>defaults}={}){
 let settings={...defaults},sentAt=[];let busy=false,pending=0,tail=Promise.resolve(),nextAllowedAt=0,pausedUntil=0,aborter=new AbortController();
 const status=()=>({enabled:true,busy,queued:Math.max(0,pending-(busy?1:0)),nextAllowedAt,pausedUntil,intervalMinSeconds:settings.minInterval,intervalMaxSeconds:settings.maxInterval,perMinute:settings.perMinute,perHour:settings.perHour,hoursEnabled:settings.hoursEnabled,start:settings.start,end:settings.end,typing:true});
 return {
  status,
  cancel(){aborter.abort();aborter=new AbortController();},
  run(options,send){
   if(pending>=50)return Promise.reject(refusal('A fila deste canal está cheia. Aguarde os envios anteriores. Esta mensagem não foi enviada.'));
   const signal=aborter.signal;pending++;const job=tail.then(()=>execute(options,send,signal)).finally(()=>{pending--;});tail=job.catch(()=>{});return job;
  }
 };
 async function execute({text='',typing,clearTyping,check=()=>true},send,signal){
   settings=settingsSchema.parse({...defaults,...await getSettings()});
   if(!withinHours(now(),settings))throw refusal('Fora do horário configurado para envios ('+settings.start+'–'+settings.end+', horário de São Paulo). Seu texto foi preservado.',409);
   if(pausedUntil>now())throw refusal('O canal pausou os envios após um aviso do provedor. Aguarde '+Math.ceil((pausedUntil-now())/1000)+' segundos e confira a conta.');
   busy=true;let attempted=false;
   const assertCurrent=async()=>{if(signal.aborted||!await check())throw refusal('O envio foi cancelado porque a conexão mudou. O texto foi preservado.',409);};
   try{
    await assertCurrent();sentAt=sentAt.filter(at=>at>now()-3600000);
    if(sentAt.length>=settings.perHour)throw refusal('O limite por hora deste canal foi atingido. Aguarde a próxima janela; o texto foi preservado.');
    const minute=sentAt.filter(at=>at>now()-60000);if(minute.length>=settings.perMinute)nextAllowedAt=Math.max(nextAllowedAt,minute[minute.length-settings.perMinute]+60000);
    const sentences=Math.max(0,(text.match(/[.!?](?:\s|$)/g)||[]).length-1);const duration=text?Math.min(60000,Math.max(1000,text.length*random(200,351))+Math.min(4,sentences)*random(1000,3001)):0;
    const delay=Math.max(0,nextAllowedAt-now()-duration);if(delay)await sleep(delay,undefined,{signal});await assertCurrent();
    if(duration){let left=duration;while(left>0){try{await typing?.();}catch{/* Presença opcional; a confirmação continua vindo do provedor. */}const part=Math.min(20000,left);await sleep(part,undefined,{signal});left-=part;await assertCurrent();}}
    settings=settingsSchema.parse({...defaults,...await getSettings()});if(!withinHours(now(),settings))throw refusal('O horário de envio encerrou enquanto a mensagem aguardava. Seu texto foi preservado.',409);
    attempted=true;const result=await send();sentAt.push(now());nextAllowedAt=now()+random(settings.minInterval*1000,settings.maxInterval*1000+1);return result;
   }catch(error){
    if(attempted){sentAt.push(now());nextAllowedAt=now()+random(settings.minInterval*1000,settings.maxInterval*1000+1);if(error.status===429||/\b429\b|rate.?limit|too many requests|temporar(?:ily|iamente).?blocked|spam/i.test(String(error.message)))pausedUntil=now()+Math.max(300000,Number(error.retryAfterMs)||0);}
    if(!attempted&&signal.aborted)throw refusal('O envio foi cancelado porque a conexão mudou. O texto foi preservado.',409);
    throw error;
   }finally{try{await clearTyping?.();}catch{}busy=false;}
  }
}
module.exports={createOutboundCare,validateFirstContact,hasLink,defaults,settingsSchema,withinHours};
