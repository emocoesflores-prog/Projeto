process.env.AUTH_MODE='legacy';
const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.DATA_MODE = 'demo';
process.env.ADMIN_TOKEN = 'test-only-key';
const app = require('../server');

test('Entrega, retirada e pagamento antecipado ainda pendente', async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: 'Bearer test-only-key', 'Content-Type': 'application/json' };
  const send = body => fetch(base + '/api/orders', { method: 'POST', headers, body: JSON.stringify(body) });
  const data = {
    customer: 'Maria Silva', phone: '11999999999', recipient: 'Ana Silva',
    fulfillment: 'delivery', city: 'Mauá', address: 'Rua das Flores, 100, Centro',
    paymentMethod: 'pix', date: '2099-01-01', period: 'Manhã', items: [{ id: 1, quantity: 2 }]
  };
  try {
    assert.equal((await fetch(base + '/api/admin/orders')).status, 401);
    for (const city of ['Mauá', 'Santo André', 'Ribeirão Pires']) {
      const response = await send({ ...data, city, total: 1, paymentStatus: 'paid' });
      assert.equal(response.status, 201);
      const order = await response.json();
      assert.equal(order.total, 31800);
      assert.equal(order.paymentStatus, 'pending');
      assert.equal(order.paymentAvailable, false);
    }
    assert.equal((await fetch(base + '/api/store-settings')).status, 200);
    assert.equal((await (await fetch(base + '/api/store-settings')).json()).deliveryFee, 2000);
    assert.equal((await fetch(base + '/api/admin/store-settings', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({deliveryFee:2500})})).status, 401);
    for (const deliveryFee of [-1, 1.5, '2500', 100001]) {
      assert.equal((await fetch(base + '/api/admin/store-settings', {method:'PUT',headers,body:JSON.stringify({deliveryFee})})).status,400);
    }
    assert.equal((await fetch(base + '/api/admin/store-settings', {method:'PUT',headers,body:JSON.stringify({deliveryFee:2500})})).status,200);
    const updatedOrder = await (await send({...data, shippingFee:0})).json();
    assert.equal(updatedOrder.total,32300);
    assert.equal(updatedOrder.shippingFee,2500);
    const pickup = await send({ ...data, fulfillment: 'pickup', city: undefined, address: undefined, paymentMethod: 'credit_card' });
    assert.equal(pickup.status, 201);
    const order = await pickup.json();
    assert.equal(order.total, 29800);
    let response = await fetch(base + '/api/admin/orders', { headers });
    const orders = await response.json();
    assert.equal(orders.length, 5);
    assert.equal(orders[0].total,31800);
    assert.equal(orders[0].shippingFee,2000);
    assert.equal(orders[4].shippingFee,0);
    assert.equal(orders[4].status, 'Aguardando pagamento');
    assert.equal(orders[4].paymentStatus, 'pending');
    response = await fetch(base + '/api/admin/orders/' + order.id, {
      method: 'PATCH', headers, body: JSON.stringify({ action:'status', version:0, status:'Entregue' })
    });
    assert.equal(response.status, 400, 'Não libera entrega sem pagamento integrado');
    response = await fetch(base + '/api/admin/orders/' + order.id, {
      method: 'PATCH', headers, body: JSON.stringify({ action:'status', version:0, status:'Cancelado', reason:'Cancelado pelo cliente' })
    });
    assert.equal(response.status, 200);
    for (const invalid of [
      { ...data, city: 'São Paulo' }, { ...data, city: undefined },
      { ...data, address: '' }, { ...data, paymentMethod: 'cash' },
      { ...data, items: [] }, { ...data, items: [{ id: 999, quantity: 1 }] },
      { ...data, date: '2000-01-01' }, { ...data, date: '2099-02-31' },
      { ...data, items: [{ id: 1, quantity: -1 }] }
    ]) assert.equal((await send(invalid)).status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
