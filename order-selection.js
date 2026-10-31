const {z}=require('zod');
const schema=z.object({action:z.literal('selection'),version:z.number().int().nonnegative(),field:z.enum(['customer','address']),customerId:z.uuid(),addressId:z.uuid().optional(),addressVersion:z.number().int().nonnegative().optional()}).strict();
async function resolve(input,customers){
 const parsed=schema.safeParse(input);const {OrderError}=require('./order-domain');
 if(!parsed.success)throw new OrderError('Selecione um cliente ou endereço válido.',400);
 const data=parsed.data,customer=await customers.get(data.customerId.toLowerCase());
 if(!customer)throw new OrderError('Cliente não encontrado nesta floricultura.',404);
 let address=null;
 if(data.addressId){address=(customer.addresses||[]).find(a=>a.id.toLowerCase()===data.addressId.toLowerCase());if(!address)throw new OrderError('Endereço não encontrado para este cliente.',404);if(address.version!==data.addressVersion)throw new OrderError('O endereço foi alterado em outra tela. Reabra a lista e selecione novamente.',409);}
 if(data.field==='address'&&!address)throw new OrderError('Escolha um endereço cadastrado.',400);
 return {customer,address};
}
module.exports={schema,resolve};
