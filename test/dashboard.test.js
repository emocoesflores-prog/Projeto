const {test}=require('node:test');
const assert=require('node:assert/strict');
const model=require('../public/dashboard-model');
test('Agenda respeita mudança de mês e exclui cancelamentos',()=>{
 const orders=[{date:'2026-12-31',status:'Aguardando pagamento',paymentStatus:'pending'},{date:'2026-12-31',status:'Cancelado',paymentStatus:'pending'},{date:'2027-01-01',status:'Aguardando pagamento',paymentStatus:'pending'}];
 const summary=model.summarize(orders,'2026-12-31');
 assert.deepEqual(summary.days.map(d=>d.date),['2026-12-31','2027-01-01','2027-01-02']);
 assert.equal(summary.today,1);assert.equal(summary.pending,2);assert.equal(summary.cancelled,1);assert.equal(summary.days[1].orders.length,1);
});
test('Clientes com o mesmo telefone formatado são agrupados',()=>{
 const result=model.customers([{customer:'Ana',phone:'(11) 99999-9999'},{customer:'Ana',phone:'11999999999'}]);
 assert.equal(result.length,1);assert.equal(result[0].count,2);
 assert.equal(model.localDate(new Date('2026-10-17T01:00:00Z')),'2026-10-16');
});
