process.env.AUTH_MODE='legacy';
const {test}=require('node:test');
const assert=require('node:assert/strict');
process.env.DATA_MODE='demo';process.env.ADMIN_TOKEN='media-policy-test';
const app=require('../server');
test('Política permite prévia local de mídia sem permitir scripts blob ou objetos embutidos',async()=>{
 const server=app.listen(0);await new Promise(r=>server.once('listening',r));try{const response=await fetch('http://127.0.0.1:'+server.address().port+'/admin.html');assert.equal(response.status,200);const policy=response.headers.get('content-security-policy');const directives=Object.fromEntries(policy.split(';').map(part=>{const [key,...value]=part.trim().split(/\s+/);return[key,value]}));assert.ok(directives['img-src'].includes('blob:'));assert.ok(directives['media-src'].includes('blob:'));assert.ok(directives['script-src'].includes("'self'"));assert.ok(!directives['script-src'].includes('blob:'));assert.ok(!directives['script-src'].includes("'unsafe-eval'"));assert.deepEqual(directives['object-src'],["'none'"]);}finally{await new Promise(r=>server.close(r));}
});
