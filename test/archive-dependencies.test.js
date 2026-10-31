const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtemp,mkdir,writeFile,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {createRequire}=require('node:module');
const {once}=require('node:events');

test('dependências corrigidas mantêm expansão, exclusão e ZIP recursivo compatíveis com o WhatsApp',async()=>{
 const whatsappRequire=createRequire(require.resolve('whatsapp-web.js'));
 const archiver=whatsappRequire('archiver');
 const unzipper=whatsappRequire('unzipper');
 const utils=createRequire(whatsappRequire.resolve('archiver'))('archiver-utils');
 const dir=await mkdtemp(join(tmpdir(),'projeto-archive-'));
 try{
  await mkdir(join(dir,'nested'));
  await writeFile(join(dir,'root.txt'),'fixture-root');
  await writeFile(join(dir,'nested','keep.txt'),'fixture-nested');
  await writeFile(join(dir,'nested','skip.txt'),'fixture-ignore');
  const expanded=utils.file.expand({cwd:dir,nodir:true},['**/*.txt','!**/skip.txt']);
  assert.deepEqual(expanded.sort(),['nested/keep.txt','root.txt']);
  for(const mode of ['directory','glob']){
   const zip=archiver('zip'),chunks=[],end=once(zip,'end');
   zip.on('data',chunk=>chunks.push(chunk));
   if(mode==='directory')zip.directory(dir,false);
   else zip.glob('**/*.txt',{cwd:dir,ignore:['**/skip.txt']});
   await zip.finalize();await end;
   const result=await unzipper.Open.buffer(Buffer.concat(chunks));
   const files=result.files.filter(f=>f.type==='File');
   assert.deepEqual(files.map(f=>f.path).sort(),mode==='directory'?['nested/keep.txt','nested/skip.txt','root.txt']:['nested/keep.txt','root.txt']);
   assert.equal((await files.find(f=>f.path==='nested/keep.txt').buffer()).toString(),'fixture-nested');
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
