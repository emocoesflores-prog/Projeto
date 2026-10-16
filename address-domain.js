const {z}=require('zod');
const {randomUUID}=require('node:crypto');
const {normalizePhone}=require('./contact');
// Independente do cadastro: um comprador pode presentear várias pessoas.
const addressSchema=z.object({
 label:z.string().trim().max(60).default(''),
 zipCode:z.string().trim().regex(/^\d{5}-?\d{3}$/,'Informe um CEP com 8 dígitos.').transform(value=>value.replace(/\D/g,'')),
 street:z.string().trim().min(3,'Informe a rua.').max(160),
 number:z.string().trim().min(1,'O número é obrigatório.').max(20).refine(value=>/\d/.test(value),'Informe o número do imóvel.'),
 neighborhood:z.string().trim().min(2,'Informe o bairro.').max(100),
 complement:z.string().trim().max(150).default(''),reference:z.string().trim().max(200).default(''),
 city:z.enum(['Mauá','Santo André','Ribeirão Pires']),state:z.literal('SP'),
 recipient:z.string().trim().min(3,'Informe o nome de quem recebe o presente.').max(120),
 recipientPhone:z.string().trim().max(30).refine(value=>!!normalizePhone(value),'Informe um telefone válido de quem recebe, com DDD.').transform(normalizePhone)
});
function formatAddress(address){return `${address.street}, ${address.number}${address.complement?', '+address.complement:''}, ${address.neighborhood}, CEP ${address.zipCode.slice(0,5)}-${address.zipCode.slice(5)}`}
function saveAddress(customer,input,id=null){
 const parsed=addressSchema.safeParse(input);if(!parsed.success){const error=new Error(parsed.error.issues[0]?.message||'Confira os dados da entrega.');error.status=400;throw error}
 const addresses=structuredClone(customer.addresses||[]),now=new Date().toISOString();
 const index=id?addresses.findIndex(address=>address.id===id):-1;
 if(id&&index<0){const error=new Error('Endereço não encontrado para este cliente.');error.status=404;throw error}
 const previous=index>=0?addresses[index]:null;
 if(previous&&(!Number.isInteger(input.version)||input.version!==previous.version)){const error=new Error('O endereço foi alterado em outra tela. Reabra a entrega e revise os dados.');error.status=409;throw error}
 const fields=parsed.data;
 const oldFields=previous?Object.fromEntries(Object.keys(fields).map(key=>[key,previous[key]??''])):null;
 const address={...fields,id:previous?.id||randomUUID(),version:previous?previous.version+1:0,createdAt:previous?.createdAt||now,updatedAt:now,history:[...(previous?.history||[]),{at:now,actor:'Administrador',action:previous?'updated':'created',before:oldFields,after:structuredClone(fields)}]};
 if(previous)addresses[index]=address;else addresses.push(address);
 return {addresses,address};
}
module.exports={addressSchema,saveAddress,formatAddress};
