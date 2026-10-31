const {z}=require('zod');
const {OrderError}=require('./order-domain');
const schema=z.object({format:z.enum(['xls','pdf','word']),ids:z.array(z.uuid().transform(id=>id.toLowerCase())).min(1).max(1000)}).strict();
const headings=['Código','Cliente','Destinatário','Data','Período','Horário','Modalidade','Cidade','Status','Pagamento','Canal','Total (R$)'];
const flow=require('./public/order-options'),presentation=require('./public/order-presentation'),rules=require('./public/shop-rules');
function rows(orders){return orders.map(o=>[o.id,o.customer,o.recipient,o.date?.split('-').reverse().join('/')||'',o.period||'',o.scheduleMode==='now'?'Para agora':o.timeSlot||'',flow.modality(o.fulfillment),o.city||'',o.status,rules.paymentLabel(o.paymentMethod,o.paymentMethodName),presentation.channel(o).label,o.total/100]);}
async function spreadsheet(orders,name){
 const XLS=require('@e965/xlsx'),sheet=XLS.utils.aoa_to_sheet([headings,...rows(orders)]);
 sheet['!cols']=[{wch:37},{wch:32},{wch:30},{wch:12},{wch:12},{wch:19},{wch:14},{wch:21},{wch:29},{wch:23},{wch:17},{wch:18}];
 sheet['!autofilter']={ref:sheet['!ref']};
 for(let r=2;r<=orders.length+1;r++)sheet['L'+r].z='"R$" #,##0.00';
 const book=XLS.utils.book_new();XLS.utils.book_append_sheet(book,sheet,'Pedidos');book.Props={Title:'Pedidos · '+name,Author:name,CreatedDate:new Date()};
 return XLS.write(book,{type:'buffer',bookType:'biff8'});
}
async function pdf(orders,name){
 const PDF=require('pdfkit'),doc=new PDF({size:'A4',layout:'landscape',margin:30,bufferPages:true,info:{Title:'Pedidos · '+name,Author:name}}),chunks=[];
 doc.registerFont('ReportRegular',require('node:path').join(__dirname,'assets/report-fonts/DejaVuSans.ttf'));doc.registerFont('ReportBold',require('node:path').join(__dirname,'assets/report-fonts/DejaVuSans-Bold.ttf'));
 const done=new Promise((resolve,reject)=>{doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 const widths=[72,172,143,78,130,112,74],labels=['Pedido','Cliente / destinatário','Agendamento','Modalidade','Status','Pagamento','Total'];let y=0;
 const title=()=>{doc.font('ReportBold').fillColor('#101052').fontSize(19).text('Pedidos · '+name,30,28,{width:780});doc.font('ReportRegular').fontSize(9).fillColor('#4a5575').text(orders.length+' pedido(s) selecionado(s) · Gerado em '+new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}),30,doc.y+5);y=doc.y+15;let x=30;labels.forEach((label,i)=>{doc.rect(x,y,widths[i],26).fill('#141452');doc.font('ReportBold').fontSize(9).fillColor('#ffffff').text(label,x+6,y+9,{width:widths[i]-12});x+=widths[i];});y+=26;};
 title();
 for(const [index,o]of orders.entries()){
  const cells=['#'+o.id.slice(0,8).toUpperCase(),o.customer+'\nPara: '+o.recipient,presentation.schedule(o),flow.modality(o.fulfillment),o.status,rules.paymentLabel(o.paymentMethod,o.paymentMethodName),(o.total/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})];
  doc.font('ReportRegular').fontSize(9);const height=Math.max(37,...cells.map((c,i)=>doc.heightOfString(c,{width:widths[i]-12})+16));
  if(y+height>doc.page.height-55){doc.addPage();title();}
  let x=30;cells.forEach((cell,i)=>{doc.rect(x,y,widths[i],height).fill(index%2?'#ffffff':'#f4f6ff');doc.fillColor('#171744').font(i===6?'ReportBold':'ReportRegular').fontSize(9).text(cell,x+6,y+8,{width:widths[i]-12});x+=widths[i];});y+=height;
 }
 const range=doc.bufferedPageRange();for(let p=range.start;p<range.start+range.count;p++){doc.switchToPage(p);doc.font('ReportRegular').fontSize(8).fillColor('#56617c').text('Página '+(p+1)+' de '+range.count,30,doc.page.height-42,{width:780,align:'right',lineBreak:false});}
 doc.end();return done;
}
async function word(orders,name){
 const {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,WidthType,PageOrientation,AlignmentType}=require('docx');
 const widths=[12,22,18,10,16,12,10],labels=['Pedido','Cliente / destinatário','Agendamento','Modalidade','Status','Pagamento','Total'];
 const cell=(text,index,header=false)=>new TableCell({width:{size:widths[index],type:WidthType.PERCENTAGE},shading:{fill:header?'141452':'FFFFFF'},margins:{top:100,bottom:100,left:100,right:100},children:[new Paragraph({children:[new TextRun({text:String(text),bold:header,color:header?'FFFFFF':'141452',size:19})]})]});
 const table=new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[new TableRow({tableHeader:true,children:labels.map((v,i)=>cell(v,i,true))}),...orders.map(o=>new TableRow({cantSplit:true,children:['#'+o.id.slice(0,8).toUpperCase(),o.customer+' / '+o.recipient,presentation.schedule(o),flow.modality(o.fulfillment),o.status,rules.paymentLabel(o.paymentMethod,o.paymentMethodName),(o.total/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})].map((v,i)=>cell(v,i))}))]});
 const doc=new Document({creator:name,title:'Pedidos · '+name,sections:[{properties:{page:{size:{orientation:PageOrientation.LANDSCAPE},margin:{top:650,bottom:650,left:650,right:650}}},children:[new Paragraph({children:[new TextRun({text:'Pedidos · '+name,bold:true,color:'141452',size:32})]}),new Paragraph({text:orders.length+' pedido(s) selecionado(s) · '+new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}),spacing:{after:240}}),table,new Paragraph({text:'Total: '+(orders.reduce((sum,o)=>sum+o.total,0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),alignment:AlignmentType.RIGHT,spacing:{before:200}})]}]});
 return Packer.toBuffer(doc);
}
function register(app,{store,readSettings}){
 app.post('/api/admin/orders/export',async(req,res,next)=>{try{
  const parsed=schema.safeParse(req.body);if(!parsed.success)throw new OrderError('Escolha o formato e até 1.000 pedidos para exportar.',400);
  const ids=[...new Set(parsed.data.ids)],orders=await store.byIds(ids);
  if(orders.length!==ids.length)throw new OrderError('A seleção contém pedido indisponível. Atualize a lista.',404);
  const map=new Map(orders.map(o=>[o.id,o])),selected=ids.map(id=>map.get(id)),name=(await readSettings()).name||'Floricultura',format=parsed.data.format;
  const file=await ({xls:spreadsheet,pdf,word}[format])(selected,name),extension=format==='word'?'docx':format,mime={xls:'application/vnd.ms-excel',pdf:'application/pdf',word:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}[format];
  res.set({'Content-Type':mime,'Content-Disposition':`attachment; filename="pedidos-${require('./public/order-options').localDate()}.${extension}"`,'Cache-Control':'no-store'}).send(file);
 }catch(error){next(error)}});
}
module.exports={register,spreadsheet,pdf,word,rows};
