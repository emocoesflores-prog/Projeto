const { z } = require('zod');
const { randomUUID } = require('node:crypto');
const sql = require('mssql');
const { OrderError } = require('./order-domain');
const { localDate } = require('./public/order-options');
const {normalizePhone}=require('./contact');
const {saveAddress}=require('./address-domain');
const optionalText = max => z.string().trim().max(max).default('');
const date = z.string().refine(value => {
  if (!value) return true;
  const parsed = new Date(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value && value <= localDate();
}, 'Informe uma data de nascimento válida, sem data futura.').default('');
const customerSchema = z.object({
  name: z.string().trim().min(3, 'Informe o nome do cliente (mínimo de 3 caracteres).').max(120),
  phone: z.string().trim().max(30).refine(value => !!normalizePhone(value), 'Informe um WhatsApp válido com DDD.').transform(normalizePhone),
  email: z.union([z.email().max(254), z.literal('')]).default(''),
  birthDate: date,
  gender: z.enum(['Não informado', 'Feminino', 'Masculino', 'Não binário', 'Outro']).default('Não informado'),
  notes: optionalText(1000), preferences: optionalText(500),
  zipCode: z.string().trim().refine(value => !value || /^\d{5}-?\d{3}$/.test(value), 'Informe um CEP válido.').default(''),
  street: optionalText(160), number: optionalText(20), complement: optionalText(100), neighborhood: optionalText(100),
  city: optionalText(100), state: z.string().trim().toUpperCase().refine(value => !value || /^[A-Z]{2}$/.test(value), 'A UF deve ter duas letras.').default('')
});
const fold = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');
function parseCustomer(body) {
  const parsed = customerSchema.safeParse(body);
  if (!parsed.success) throw new OrderError(parsed.error.issues[0]?.message || 'Confira os dados do cliente.', 400);
  return parsed.data;
}
function createCustomerStore({ demo, getPool }) {
  const customers = [];
  function decode(row) { const { payload, phoneKey, ...columns } = row; return { ...JSON.parse(payload), ...columns, phone: phoneKey }; }
  return {
    async search(query = '') {
      const digits = query.replace(/\D/g, '');
      if (demo) return customers.filter(customer => !query || fold(customer.name).includes(fold(query)) || (digits && customer.phone.includes(digits))).sort((a,b) => a.name.localeCompare(b.name,'pt-BR')).slice(0,20).map(({ id, name, phone, createdAt }) => ({ id, name, phone, createdAt }));
      const escape = value => value.replace(/[~%_\[]/g, '~$&');
      const result = await getPool().request().input('query', sql.NVarChar(180), '%' + escape(query) + '%').input('digits', sql.VarChar(60), digits).input('phone', sql.VarChar(70), '%' + digits + '%').query("SELECT TOP(20) id,name,phoneKey AS phone,createdAt FROM dbo.Customers WHERE name COLLATE Latin1_General_100_CI_AI LIKE @query ESCAPE N'~' OR (@digits<>'' AND phoneKey LIKE @phone) ORDER BY name,id");
      return result.recordset;
    },
    async get(id) {
      if (demo) { const customer = customers.find(customer => customer.id === id); return customer ? structuredClone(customer) : null; }
      const result = await getPool().request().input('id', sql.UniqueIdentifier, id).query('SELECT * FROM dbo.Customers WHERE id=@id');
      return result.recordset[0] ? decode(result.recordset[0]) : null;
    },
    async saveAddress(customerId,body,addressId=null) {
      function update(customer){if(!customer)throw new OrderError('Cliente não encontrado.',404);try{return saveAddress(customer,body,addressId)}catch(error){throw new OrderError(error.message,error.status||400)}}
      if(demo){const index=customers.findIndex(customer=>customer.id===customerId);const result=update(index>=0?customers[index]:null);customers[index].addresses=result.addresses;return structuredClone(result.address)}
      const tx=new sql.Transaction(getPool());await tx.begin();
      try{
        const response=await new sql.Request(tx).input('id',sql.UniqueIdentifier,customerId).query('SELECT * FROM dbo.Customers WITH(UPDLOCK,HOLDLOCK) WHERE id=@id');
        const customer=response.recordset[0]?decode(response.recordset[0]):null;
        const result=update(customer);
        await new sql.Request(tx).input('id',sql.UniqueIdentifier,customerId).input('payload',sql.NVarChar(sql.MAX),JSON.stringify({...customer,addresses:result.addresses})).query('UPDATE dbo.Customers SET payload=@payload WHERE id=@id');
        await tx.commit();return result.address;
      }catch(error){try{await tx.rollback()}catch{}throw error}
    },
    async insert(body) {
      const data = parseCustomer(body);
      const customer = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
      if (demo) {
        if (customers.some(existing => existing.phone === data.phone)) throw new OrderError('Já existe cliente com este WhatsApp. Pesquise o telefone e selecione o cadastro existente.');
        customers.push(customer); return structuredClone(customer);
      }
      try {
        await getPool().request().input('id', sql.UniqueIdentifier, customer.id).input('name', sql.NVarChar(120), data.name).input('phone', sql.VarChar(13), data.phone).input('payload', sql.NVarChar(sql.MAX), JSON.stringify(customer)).query('INSERT INTO dbo.Customers(id,name,phoneKey,payload) VALUES(@id,@name,@phone,@payload)');
        return customer;
      } catch (error) {
        if ([2601,2627].includes(error.number)) throw new OrderError('Já existe cliente com este WhatsApp. Pesquise o telefone e selecione o cadastro existente.');
        throw error;
      }
    }
  };
}
module.exports = { createCustomerStore, normalizePhone, customerSchema };
