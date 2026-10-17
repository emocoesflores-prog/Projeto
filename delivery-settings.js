const {z}=require('zod');
const {normalize}=require('./public/delivery-rates');
const rate=z.object({city:z.string().trim().min(2).max(100),neighborhood:z.string().trim().max(100).default(''),fee:z.number().int().min(0).max(100000)}).strict();
const deliverySettingsSchema=z.object({pickupAddress:z.string().trim().max(300),deliveryRates:z.array(rate).max(200).superRefine((rules,ctx)=>{const seen=new Set();for(const r of rules){const key=normalize(r.city)+'|'+normalize(r.neighborhood);if(seen.has(key))ctx.addIssue({code:'custom',message:'Há uma cidade e bairro repetidos. Edite a taxa existente.'});seen.add(key);}})}).strict();
module.exports={deliverySettingsSchema};
