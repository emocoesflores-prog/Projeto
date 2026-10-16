const { z } = require('zod');
const cities = ['Mauá', 'Santo André', 'Ribeirão Pires'];
const phone = z.string().regex(/^\+?[\d ()-]{10,20}$/);
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date())}
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
 const d=new Date(value);return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===value;
},'Data inválida');
const detailsObject=z.object({
 customer:z.string().trim().min(3).max(120),phone,
 recipient:z.string().trim().min(3).max(120),recipientPhone:z.union([phone,z.literal('')]).default(''),
 fulfillment:z.enum(['delivery','pickup']),city:z.enum(cities).optional(),address:z.string().trim().max(500).optional(),
 date:calendarDate,period:z.enum(['Manhã','Tarde']),
 message:z.string().max(500).default(''),anonymous:z.boolean().default(false),
 occasion:z.enum(['Sem ocasião específica','Aniversário','Amor e romance','Agradecimento','Maternidade','Condolências','Celebração']).default('Sem ocasião específica'),
 flowerNotes:z.string().trim().max(1000).default(''),deliveryNotes:z.string().trim().max(500).default(''),
 substitution:z.enum(['contact','allowed']).default('contact')
});
function validateDelivery(data,ctx){if(data.fulfillment==='delivery'&&(!data.city||!data.address||data.address.length<10))ctx.addIssue({code:'custom',message:'Informe cidade atendida e endereço completo.',path:['address']})}
const detailsSchema=detailsObject.superRefine(validateDelivery);
const schema=detailsObject.extend({
 paymentMethod:z.enum(['pix','credit_card']),
 items:z.array(z.object({id:z.number().int().positive(),quantity:z.number().int().min(1).max(20),note:z.string().trim().max(300).default('')})).min(1).max(30)
}).superRefine((data,ctx)=>{validateDelivery(data,ctx);if(data.date<today())ctx.addIssue({code:'custom',message:'Escolha hoje ou uma data futura.',path:['date']})});
function total(items,catalog,fulfillment='delivery',shippingFee=2000){return items.reduce((sum,item)=>{const product=catalog.find(p=>p.id===item.id);if(!product)throw Error('Produto indisponível');return sum+product.price*item.quantity},0)+(fulfillment==='pickup'?0:shippingFee)}
module.exports={schema,detailsSchema,total,cities,today};
