(function(root){
 function phoneDigits(value){let digits=String(value||'').replace(/\D/g,'');if((digits.length===12||digits.length===13)&&digits.startsWith('55'))digits=digits.slice(2);return digits.slice(0,11)}
 function phone(value){const digits=phoneDigits(value);if(!digits)return '';if(digits.length<=2)return '('+digits;const local=digits.slice(2),split=digits.length>10?5:4;return '('+digits.slice(0,2)+') '+local.slice(0,split)+(local.length>split?'-'+local.slice(split):'')}
 function cep(value){const digits=String(value||'').replace(/\D/g,'').slice(0,8);return digits.slice(0,5)+(digits.length>5?'-'+digits.slice(5):'')}
 function documentNumber(value){const d=String(value||'').replace(/\D/g,'').slice(0,14);return d.length<=11?d.replace(/^(\d{3})(\d)/,'$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/,'$1.$2.$3').replace(/(\d{3})(\d{1,2})$/,'$1-$2'):d.replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3').replace(/(\d{3})(\d)/,'$1/$2').replace(/(\d{4})(\d{1,2})$/,'$1-$2')}
 function currency(value){const digits=String(value||'').replace(/\D/g,'').slice(0,8);return digits?(Number(digits)/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):''}
 function moneyValue(value){return Math.round(Number(String(value||'').replace(/\./g,'').replace(',','.'))*100)}
 function kind(input){if(input?.matches?.('[data-mask="identity"]'))return /^[\d .\/-]+$/.test(input.value)&&input.value.replace(/\D/g,'').length>11?'document':null;return input?.matches?.('[data-mask="document"]')?'document':input?.matches?.('[data-mask="currency"]')?'currency':input?.matches?.('input[type="tel"]')?'phone':input?.matches?.('input[name="zipCode"],input[data-mask="cep"]')?'cep':null}
 function applyInput(input){const type=kind(input);if(!type)return;const raw=input.value,position=input.selectionStart??raw.length;let count=raw.slice(0,position).replace(/\D/g,'').length;if(type==='phone'&&(raw.replace(/\D/g,'').length===12||raw.replace(/\D/g,'').length===13)&&raw.replace(/\D/g,'').startsWith('55'))count=Math.max(0,count-2);const formatted=type==='phone'?phone(raw):type==='document'?documentNumber(raw):type==='currency'?currency(raw):cep(raw);input.value=formatted;if(document.activeElement===input){let caret=0,seen=0;while(caret<formatted.length&&seen<count){if(/\d/.test(formatted[caret]))seen++;caret++}if(position===raw.length)caret=formatted.length;try{input.setSelectionRange(caret,caret)}catch{}}}
 function apply(scope=document){for(const input of scope.querySelectorAll('input[type="tel"],input[name="zipCode"],input[data-mask]'))applyInput(input)}
 const api={phoneDigits,phone,cep,documentNumber,currency,moneyValue,apply};
 if(typeof module==='object')module.exports=api;else{
  root.InputMasks=api;
  document.addEventListener('input',event=>applyInput(event.target),true);
  document.addEventListener('focusin',event=>applyInput(event.target));
  document.addEventListener('beforeinput',event=>{const input=event.target;if(kind(input)!=='phone'||event.inputType!=='deleteContentBackward'||input.selectionStart!==input.selectionEnd)return;const position=input.selectionStart;if(position>0&&!/\d/.test(input.value[position-1])){let previous=position-1;while(previous>=0&&!/\d/.test(input.value[previous]))previous--;if(previous<0)return;event.preventDefault();input.value=input.value.slice(0,previous)+input.value.slice(previous+1);input.setSelectionRange(previous,previous);applyInput(input);input.dispatchEvent(new Event('input',{bubbles:true}))}});
 }
})(globalThis);
