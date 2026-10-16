function normalizePhone(value) {
 let digits=String(value).replace(/\D/g,'');
 if(digits.length===10||digits.length===11)digits='55'+digits;
 return /^55[1-9]\d{9,10}$/.test(digits)?digits:null;
}
module.exports={normalizePhone};
