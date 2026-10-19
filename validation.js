const { z } = require('zod');
const options=require('./public/order-options');
const cities = ['Mauá', 'Santo André', 'Ribeirão Pires'];
const phone = z.string().regex(/^\+?[\d ()-]{10,20}$/);
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date())}
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
 const d=new Date(value);return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===value;
},'Data inválida');
const detailsObject=z.object({
 customer:z.string().trim().max(120).default(''),phone:z.union([phone,z.literal('')]).default(''),
 recipient:z.string().trim().max(120).default(''),recipientPhone:z.union([phone,z.literal('')]).default(''),
 pickupLocationId:z.union([z.uuid(),z.literal('legacy'),z.literal('')]).optional(),
 neighborhood:z.string().trim().max(100).default(''),
 fulfillment:z.enum(['store','pickup','delivery']),city:z.string().trim().max(100).refine(require('./tenant-context').serves,'Cidade fora da área de entrega desta floricultura.').optional(),address:z.string().trim().max(500).optional(),
 date:calendarDate,period:z.enum(['Manhã','Tarde']),
 scheduleMode:z.enum(['now','scheduled']).default('scheduled'),timeSlot:z.string().refine(s=>s===''||require('./public/shop-rules').validSlot(s),'Faixa de horário inválida.').default(''),
 message:z.string().max(500).default(''),anonymous:z.boolean().default(false),
 occasion:z.enum(['Sem ocasião específica','Aniversário','Amor e romance','Agradecimento','Maternidade','Condolências','Celebração']).default('Sem ocasião específica'),
 flowerNotes:z.string().trim().max(1000).default(''),deliveryNotes:z.string().trim().max(500).default(''),
 substitution:z.enum(['contact','allowed']).default('contact')
});
function validateDelivery(data,ctx){
 if(data.fulfillment!=='store'&&(data.customer.length<3||!data.phone||data.recipient.length<3))ctx.addIssue({code:'custom',message:'Informe cliente, telefone e destinatário para entrega ou retirada.',path:['customer']});
 if(data.customer&&data.customer.length<3)ctx.addIssue({code:'custom',message:'O nome do cliente deve ter ao menos 3 caracteres.',path:['customer']});
 if(data.fulfillment==='delivery'&&(!data.city||!data.address||data.address.length<10))ctx.addIssue({code:'custom',message:'Informe cidade atendida e endereço completo.',path:['address']});
 if(data.scheduleMode==='now'&&data.timeSlot)ctx.addIssue({code:'custom',message:'Pedido para agora não possui faixa agendada.',path:['timeSlot']});
 if(data.timeSlot&&options.period(data.timeSlot)!==data.period)ctx.addIssue({code:'custom',message:'O período não corresponde à faixa de horário.',path:['period']});
}
const detailsSchema=detailsObject.superRefine(validateDelivery);
const schema=detailsObject.extend({
 paymentMethod:z.string().regex(/^(pix|credit_card|debit_card|cash|bank_transfer|custom-[a-z0-9-]{1,30})$/),
 items:z.array(z.object({id:z.number().int().positive(),quantity:z.number().int().min(1).max(20),note:z.string().trim().max(300).default('')})).min(1).max(30)
}).superRefine((data,ctx)=>{validateDelivery(data,ctx);if(data.date<today())ctx.addIssue({code:'custom',message:'Escolha hoje ou uma data futura.',path:['date']})});
function total(items,catalog,fulfillment='delivery',shippingFee=2000){return items.reduce((sum,item)=>{const product=catalog.find(p=>p.id===item.id);if(!product)throw Error('Produto indisponível');return sum+product.price*item.quantity},0)+(fulfillment==='delivery'?shippingFee:0)}
module.exports={schema,detailsSchema,total,cities,today};
