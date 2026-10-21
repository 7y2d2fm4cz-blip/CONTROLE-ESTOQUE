import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';

export async function buildPurchasePdf(request:any){
 const doc=await PDFDocument.create();const regular=await doc.embedFont(StandardFonts.Helvetica);const bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const allowed=new Set(regular.getCharacterSet());
 const clean=(value:any)=>Array.from(String(value??'').replace(/[\r\n\t]+/g,' ')).map(c=>allowed.has(c.codePointAt(0)!)?c:'?').join('');
 const navy=rgb(.07,.17,.23),teal=rgb(0,.49,.50),muted=rgb(.36,.43,.48),line=rgb(.87,.90,.92),pale=rgb(.94,.97,.97);
 const width=595.28,height=841.89,left=42,right=553.28,bottom=63;
 let page:any,y=0;
 const date=(value:any)=>value?new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'-';
 function text(value:any,x:number,top:number,size=10,strong=false,color=navy){page.drawText(clean(value),{x,y:top-size,size,font:strong?bold:regular,color});}
 function wrap(value:any,maxWidth:number,size=10,strong=false){
  const font=strong?bold:regular,parts=clean(value).split(/\s+/),lines:string[]=[];let current='';
  for(const word of parts){
   if(font.widthOfTextAtSize((current?current+' ':'')+word,size)<=maxWidth){current+=(current?' ':'')+word;continue;}
   if(current){lines.push(current);current='';}
   let part='';for(const char of word){if(part&&font.widthOfTextAtSize(part+char,size)>maxWidth){lines.push(part);part='';}part+=char;}current=part;
  }
  if(current||!lines.length)lines.push(current);return lines;
 }
 function newPage(){page=doc.addPage([width,height]);page.drawRectangle({x:0,y:height-94,width,height:94,color:navy});text('ALMOX | REQUISIÇÃO DE COMPRA',left,height-26,15,true,rgb(1,1,1));text(request.number,left,height-53,14,true,rgb(.53,.85,.83));text('Aprovação registrada no sistema',left,height-74,9,false,rgb(.79,.86,.89));y=height-116;}
 function ensure(space:number){if(y-space<bottom)newPage();}
 function field(label:string,value:any){const lines=wrap(value||'-',right-left-140,10);ensure(Math.max(24,lines.length*14+10));text(label,left,y,9,true,muted);lines.forEach((s,i)=>text(s,left+140,y-i*14,10));y-=Math.max(24,lines.length*14+10);}
 function paragraph(label:string,value:any){if(!value)return;const lines=wrap(value,right-left-20,10);ensure(30);text(label,left,y,10,true,teal);y-=20;for(const s of lines){ensure(15);text(s,left+10,y,10);y-=14;}y-=12;}
 function tableHead(){ensure(38);page.drawRectangle({x:left,y:y-25,width:right-left,height:25,color:teal});text('ITEM',left+7,y-7,8,true,rgb(1,1,1));text('DESCRIÇÃO / CÓDIGO',left+42,y-7,8,true,rgb(1,1,1));text('UN.',left+365,y-7,8,true,rgb(1,1,1));text('QUANTIDADE',left+410,y-7,8,true,rgb(1,1,1));y-=25;}
 newPage();field('OBRA',request.project);field('FINALIDADE',request.reference);field('PRIORIDADE',request.priority);field('SOLICITANTE',request.createdBy);field('DATA DA REQUISIÇÃO',date(request.createdAt));field('SITUAÇÃO ATUAL',request.status);
 const approval=wrap('Aprovado por '+request.approvedBy+' em '+date(request.approvedAt),right-left-24,10);const approvalHeight=43+approval.length*13;ensure(approvalHeight+18);page.drawRectangle({x:left,y:y-approvalHeight,width:right-left,height:approvalHeight,color:pale});text('APROVAÇÃO',left+12,y-9,10,true,teal);approval.forEach((s,i)=>text(s,left+12,y-29-i*13,10));y-=approvalHeight+17;
 tableHead();
 for(const [index,item] of request.items.entries()){
  const description=wrap(item.description,308,10);const code=item.code?wrap('Código: '+item.code,308,8):[];const origin=item.fromMinimum?'Origem: recomposição do estoque mínimo':'Origem: necessidade manual';const lines=[...description.map(s=>({s,size:10})),...code.map(s=>({s,size:8})),{s:origin,size:8}];
  const units=wrap(item.unit,35,8),quantities=wrap(Number(item.qty).toLocaleString('pt-BR',{maximumFractionDigits:6}),93,9,true);const totalLines=Math.max(lines.length,units.length,quantities.length);let start=0;
  while(start<totalLines){
   if(y-bottom<49){newPage();tableHead();}
   const capacity=Math.max(1,Math.floor((y-bottom-18)/13));const lineCount=Math.min(capacity,totalLines-start);const chunk=lines.slice(start,start+lineCount);const rowHeight=lineCount*13+18;
   if(index%2===0)page.drawRectangle({x:left,y:y-rowHeight,width:right-left,height:rowHeight,color:pale});
   text(start?String(index+1)+' cont.':String(index+1),left+7,y-9,8);
   chunk.forEach((entry,j)=>text(entry.s,left+42,y-8-j*13,entry.size,false,entry.size===8?muted:navy));
   units.slice(start,start+lineCount).forEach((s,j)=>text(s,left+365,y-9-j*13,8));quantities.slice(start,start+lineCount).forEach((s,j)=>text(s,left+410,y-9-j*13,9,true));
   page.drawLine({start:{x:left,y:y-rowHeight},end:{x:right,y:y-rowHeight},thickness:.6,color:line});y-=rowHeight;start+=lineCount;
  }
 }
 y-=18;paragraph('OBSERVAÇÕES',request.notes);paragraph('REGISTRO DA APROVAÇÃO',request.approvalNote);paragraph('CONTROLE','Documento gerado a partir da requisição aprovada. Não registra entrada de material nem substitui o recebimento da nota fiscal. Datas no horário de Brasília.');
 const pages=doc.getPages();for(const [i,p] of pages.entries()){p.drawLine({start:{x:left,y:46},end:{x:right,y:46},thickness:.6,color:line});p.drawText(wrap(request.number+' | Aprovador: '+request.approvedBy,right-left-90,7)[0],{x:left,y:31,size:7,font:regular,color:muted});p.drawText('Página '+(i+1)+' de '+pages.length,{x:right-70,y:31,size:8,font:regular,color:muted});}
 doc.setTitle('Requisição de compra '+request.number);doc.setSubject('Requisição aprovada');doc.setCreator('ALMOX - Controle de Estoque');return doc.save();
}
