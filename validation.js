const { z } = require('zod');
const cities = ['Mauá', 'Santo André', 'Ribeirão Pires'];
const schema = z.object({
  customer: z.string().trim().min(3).max(120),
  phone: z.string().regex(/^\+?[\d ()-]{10,20}$/),
  recipient: z.string().trim().min(3).max(120),
  fulfillment: z.enum(['delivery', 'pickup']),
  city: z.enum(cities).optional(),
  address: z.string().trim().max(500).optional(),
  paymentMethod: z.enum(['pix', 'credit_card']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(value);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value && value >= today;
  }, 'Escolha hoje ou uma data futura'),
  period: z.enum(['Manhã', 'Tarde']),
  message: z.string().max(500).default(''),
  anonymous: z.boolean().default(false),
  items: z.array(z.object({ id: z.number().int().positive(), quantity: z.number().int().min(1).max(20) })).min(1).max(30)
}).superRefine((data, ctx) => {
  if (data.fulfillment === 'delivery' && (!data.city || !data.address || data.address.length < 10)) {
    ctx.addIssue({ code: 'custom', message: 'Informe cidade atendida e endereço completo.', path: ['address'] });
  }
});
function total(items, catalog, fulfillment = 'delivery', shippingFee = 2000) {
  return items.reduce((sum, item) => {
    const product = catalog.find(product => product.id === item.id);
    if (!product) throw Error('Produto indisponível');
    return sum + product.price * item.quantity;
  }, 0) + (fulfillment === 'pickup' ? 0 : shippingFee);
}
module.exports = { schema, total, cities };
