const {test}=require('node:test');
const assert=require('node:assert/strict');
const {applyOperations,state,fiscalDefaults}=require('../shop-operations');
const tenant=id=>({id,name:id,slug:id,profile:{}});
function save(t,settings){return applyOperations(t,{action:'fiscal.save',version:state(t).revision,data:settings}).tenant;}
test('cadastro fiscal é exclusivo da floricultura e não altera a origem',()=>{
 const a=tenant('loja-a'),b=tenant('loja-b'),settings={...fiscalDefaults(),legalName:'Empresa A',cnpj:'08458020000112'};
 const updated=save(a,settings);
 assert.equal(state(updated).fiscal.legalName,'Empresa A');
 assert.equal(state(b).fiscal.legalName,'');
 assert.equal(a.profile.operations,undefined);
 assert.equal(state(updated).revision,1);
 settings.legalName='Alterado fora da operação';
 assert.equal(state(updated).fiscal.legalName,'Empresa A');
});
test('cadastro fiscal rejeita credenciais, impostos inválidos e sobrescrita de versão antiga',()=>{
 const a=tenant('loja-a');
 assert.throws(()=>save(a,{...fiscalDefaults(),certificatePassword:'secret'}));
 assert.throws(()=>save(a,{...fiscalDefaults(),defaults:{...fiscalDefaults().defaults,icms:101}}));
 assert.throws(()=>save(a,{...fiscalDefaults(),cnpj:'123'}));
 const updated=save(a,fiscalDefaults());
 assert.throws(()=>applyOperations(updated,{action:'fiscal.save',version:0,data:fiscalDefaults()}),e=>e.status===409);
});
test('cadastro não habilita emissão real sem integração homologada',()=>{
 const settings=fiscalDefaults();
 settings.nfe.enabled=true;
 assert.throws(()=>save(tenant('loja-a'),settings),/ainda não está integrada/);
 assert.equal(state(tenant('loja-b')).fiscal.environment,'homologation');
});
