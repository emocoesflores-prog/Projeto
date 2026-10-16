const { z } = require('zod');
const defaults = {
  deliveryFee: 2000,
  pickupAddress: 'Rua Havana, 95, Parque das Américas, Mauá – SP'
};
const settingsSchema = z.object({ deliveryFee: z.number().int().min(0).max(100000) }).strict();
module.exports = { defaults, settingsSchema };
