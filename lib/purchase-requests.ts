export function isOpenPurchase(request:any):boolean{return ['Solicitada','Aguardando aprovação','Aprovada','Em compra','Compra parcial','Aguardando entrega','Recebida parcialmente'].includes(request.status);}
export function needsPurchaseApproval(request:any):boolean{return ['Solicitada','Aguardando aprovação','Em compra'].includes(request.status)&&!request.approvedAt;}
export function canExportPurchase(request:any):boolean{return !!request.approvedAt&&!!request.approvedById&&['Aprovada','Em compra','Compra parcial','Aguardando entrega','Recebida parcialmente','Encerrada'].includes(request.status);}
export function minimumShortfall(material:any):number{return Number(material.minimum)>0?Math.max(0,Number((Number(material.minimum)-Number(material.qty)).toFixed(9))):0;}

export function createPurchase(data:any,user:any,body:any,version:number,now:string) {
 data.purchaseRequests??=[];
 const text=(x:any)=>String(x??'').trim().slice(0,500);
 const project=text(body.project),reference=text(body.reference);
 if(!data.projects.some((p:any)=>p.name===project))throw Error('Selecione uma obra cadastrada para a compra.');
 if(!reference)throw Error('Informe a finalidade da compra.');
 if(!Array.isArray(body.items)||!body.items.length||body.items.length>300)throw Error('Inclua de 1 a 300 itens na compra.');
 const seen=new Set();
 const items=body.items.map((i:any)=>{
  const m=i.materialId?data.materials.find((m:any)=>m.id===i.materialId):null;
  if(i.materialId&&!m)throw Error('Material não encontrado.');
  if(m&&m.project!==project)throw Error('Use materiais da mesma obra na requisição.');
  const qty=Number(i.qty);if(!Number.isFinite(qty)||qty<=0)throw Error('Defina uma quantidade de compra maior que zero.');
  const description=m?.description||text(i.description),unit=m?.unit||text(i.unit).toUpperCase();
  if(!description||!unit)throw Error('Informe descrição e unidade em todos os itens.');
  if(m&&seen.has(m.id))throw Error('Material repetido. Ajuste a quantidade na mesma linha.');if(m)seen.add(m.id);
  if(i.fromMinimum){
   if(!m||minimumShortfall(m)<=0)throw Error('O estoque deste material já atende ao mínimo. Atualize a sugestão.');
   if(data.purchaseRequests.some((p:any)=>isOpenPurchase(p)&&p.items.some((x:any)=>x.materialId===m.id)))throw Error('Já existe compra aberta para este material. Consulte a requisição existente.');
  }
  return {id:crypto.randomUUID(),materialId:m?.id||'',description,code:m?.code||text(i.code),unit,qty,fromMinimum:!!i.fromMinimum,minimumAtRequest:m?.minimum||0,balanceAtRequest:m?.qty||0};
 });
 const request={id:crypto.randomUUID(),number:'RC-'+String(version).padStart(6,'0'),project,reference,notes:text(body.notes),priority:body.priority==='Urgente'?'Urgente':'Normal',items,status:'Aguardando aprovação',createdAt:now,createdBy:user.displayName,createdById:user.userId};
 data.purchaseRequests.unshift(request);return request;
}

export function updatePurchase(data:any,user:any,body:any,now:string){
 const request=data.purchaseRequests.find((p:any)=>p.id===body.purchaseId);if(!request||!isOpenPurchase(request))throw Error('Compra não encontrada ou já encerrada.');
 if(body.action!=='cancel-purchase'&&body.status!=='Cancelada')throw Error('Registre as quantidades compradas em Suprimentos. O encerramento é automático e exclusivo pelo recebimento integral no estoque.');
 if((request.orders||[]).length||(request.receipts||[]).length)throw Error('Não é permitido cancelar uma requisição com compra ou recebimento registrado. As pendências devem continuar em acompanhamento.');
 const note=String(body.note??'').trim().slice(0,500);if(!note)throw Error('Informe a justificativa do cancelamento.');
 request.history??=[];request.history.unshift({date:now,by:user.displayName,byId:user.userId,status:'Cancelada',note});request.status='Cancelada';request.updatedAt=now;request.updatedBy=user.displayName;
 for(const r of data.replenishments||[]){if(r.purchaseRequestId===request.id){r.status='Cancelada';r.closedAt=now;r.closedBy=user.displayName;}}
}

export function decidePurchase(data:any,user:any,body:any,now:string,isAdmin=false){
 const request=data.purchaseRequests.find((p:any)=>p.id===body.purchaseId);
 if(!request||!needsPurchaseApproval(request))throw Error('Esta requisição não está aguardando aprovação.');
 if(request.createdById===user.userId&&!isAdmin)throw Error('A aprovação deve ser realizada por outra pessoa. Você não pode decidir a própria requisição.');
 const note=String(body.note??'').trim().slice(0,500);const approved=body.action==='approve-purchase';
 if(!approved&&!note)throw Error('Informe a justificativa da reprovação.');
 request.history??=[];request.history.unshift({date:now,by:user.displayName,byId:user.userId,status:approved?'Aprovada':'Reprovada',note});
 request.status=approved?'Aprovada':'Reprovada';request.updatedAt=now;request.updatedBy=user.displayName;
 if(approved){request.selfApprovedByAdmin=!!isAdmin&&request.createdById===user.userId;request.approvedAt=now;request.approvedBy=user.displayName;request.approvedById=user.userId;request.approvalNote=note;}
 else{request.rejectedAt=now;request.rejectedBy=user.displayName;request.rejectedById=user.userId;request.rejectionNote=note;for(const r of data.replenishments||[]){if(r.purchaseRequestId===request.id){r.status='Cancelada';r.closedAt=now;r.closedBy=user.displayName;}}}
}

const rounded=(value:number)=>Number(value.toFixed(9));
export function purchaseItemProgress(request:any,item:any){
 const purchased=rounded((request.orders||[]).filter((o:any)=>o.purchaseItemId===item.id).reduce((sum:number,o:any)=>sum+Number(o.qty),0));
 const received=rounded((request.receipts||[]).filter((r:any)=>r.purchaseItemId===item.id).reduce((sum:number,r:any)=>sum+Number(r.qty),0));
 return {requested:Number(item.qty),purchased,received,toPurchase:Math.max(0,rounded(Number(item.qty)-purchased)),toReceive:Math.max(0,rounded(Number(item.qty)-received)),inTransit:Math.max(0,rounded(purchased-received))};
}
export function purchaseQueue(request:any,queue:string,userId:string,allowOwnApproval=false){
 if(queue==='mine')return request.createdById===userId;
 if(queue==='approval')return needsPurchaseApproval(request)&&(allowOwnApproval||request.createdById!==userId);
 if(queue==='procurement')return isOpenPurchase(request)&&canExportPurchase(request)&&request.items.some((i:any)=>purchaseItemProgress(request,i).toPurchase>0);
 if(queue==='receiving')return isOpenPurchase(request)&&canExportPurchase(request)&&request.items.some((i:any)=>purchaseItemProgress(request,i).inTransit>0);
 return true;
}

export function refreshPurchaseFulfillment(data:any,now:string,user:any){
 for(const request of data.purchaseRequests||[]){
  if(!isOpenPurchase(request)||!request.approvedAt||!(request.orders||[]).length)continue;
  const progress=request.items.map((i:any)=>purchaseItemProgress(request,i));
  const complete=progress.length>0&&progress.every((p:any)=>p.toReceive===0);
  request.status=complete?'Encerrada':progress.some((p:any)=>p.received>0)?'Recebida parcialmente':progress.every((p:any)=>p.toPurchase===0)?'Aguardando entrega':'Compra parcial';
  if(complete){request.closedAt=now;request.closedBy=user.displayName;request.closedByReceiving=true;for(const r of data.replenishments||[]){if(r.purchaseRequestId===request.id){r.status='Encerrada';r.closedAt=now;r.closedBy=user.displayName;}}}
 }
}

export function recordPurchase(data:any,user:any,body:any,now:string){
 const request=data.purchaseRequests.find((r:any)=>r.id===body.purchaseId);
 if(!request||!isOpenPurchase(request)||!canExportPurchase(request))throw Error('A requisição precisa estar aprovada e aberta para registrar a compra.');
 const text=(x:any)=>String(x??'').trim().slice(0,500);const supplier=text(body.supplier),orderNumber=text(body.orderNumber),expectedDate=text(body.expectedDate);
 if(!supplier||!orderNumber)throw Error('Informe fornecedor e número do pedido.');
 if(expectedDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(expectedDate)||!Number.isFinite(Date.parse(expectedDate))||new Date(expectedDate).toISOString().slice(0,10)!==expectedDate))throw Error('Informe uma previsão de entrega válida.');
 if(!Array.isArray(body.items)||!body.items.length||body.items.length>300)throw Error('Informe os itens e as quantidades compradas.');
 const seen=new Set();const lines=body.items.map((i:any)=>{
  const item=request.items.find((x:any)=>x.id===i.purchaseItemId);const qty=Number(i.qty),orderItem=text(i.orderItem);
  if(!item||!Number.isFinite(qty)||qty<=0||qty>purchaseItemProgress(request,item).toPurchase)throw Error('Quantidade comprada inválida ou superior ao saldo aprovado.');
  if(!orderItem)throw Error('Informe o item do pedido de compra.');
  if(seen.has(item.id)||seen.has('po:'+orderItem))throw Error('Item repetido no lançamento de compra.');seen.add(item.id);seen.add('po:'+orderItem);
  if((request.orders||[]).some((o:any)=>o.orderNumber===orderNumber&&o.orderItem===orderItem))throw Error('Este pedido e item já foram registrados nesta requisição.');
  return {id:crypto.randomUUID(),purchaseItemId:item.id,qty,orderNumber,orderItem,supplier,expectedDate,date:now,by:user.displayName,byId:user.userId};
 });
 request.orders??=[];request.orders.push(...lines);request.history??=[];request.history.unshift({date:now,by:user.displayName,byId:user.userId,status:'Compra registrada',note:'Pedido '+orderNumber+' - '+supplier+' - '+lines.length+' itens'});
 refreshPurchaseFulfillment(data,now,user);
}

// The only path that credits a purchase as delivered is the authenticated invoice receipt transaction.
export function linkPurchaseReceipt(data:any,invoice:any,line:any,qty:number,invoiceId:string,now:string,user:any){
 if(!line.purchaseId&&!line.purchaseItemId&&!line.orderLineId)return null;
 const request=data.purchaseRequests.find((r:any)=>r.id===line.purchaseId);
 if(!request||!isOpenPurchase(request)||!canExportPurchase(request)||request.project!==String(invoice.project).trim())throw Error('Requisição vinculada inválida, não aprovada ou de outra obra.');
 const item=request.items.find((i:any)=>i.id===line.purchaseItemId);const order=(request.orders||[]).find((o:any)=>o.id===line.orderLineId&&o.purchaseItemId===line.purchaseItemId);
 if(!item||!order)throw Error('Selecione a requisição, o item e o pedido de compra para o recebimento.');
 if(String(line.unit).trim().toUpperCase()!==item.unit)throw Error('Unidade da nota diferente da unidade da requisição.');
 if(line.materialId&&item.materialId&&line.materialId!==item.materialId)throw Error('Material da nota diferente do material da requisição.');
 if(!String(invoice.orderNumber).split(/[,;]/).map((s:string)=>s.trim()).includes(order.orderNumber)||String(line.orderItem).trim()!==order.orderItem)throw Error('Número ou item do pedido da nota diferente da compra selecionada.');
 const already=(request.receipts||[]).filter((r:any)=>r.orderLineId===order.id).reduce((sum:number,r:any)=>sum+Number(r.qty),0);
 if(!Number.isFinite(qty)||qty<=0||rounded(already+qty)>order.qty||qty>purchaseItemProgress(request,item).toReceive)throw Error('Quantidade entregue superior ao saldo comprado ou requisitado. Confira as entregas anteriores.');
 const receipt={id:crypto.randomUUID(),purchaseItemId:item.id,orderLineId:order.id,invoiceId,invoiceNumber:String(invoice.number),orderNumber:order.orderNumber,orderItem:order.orderItem,qty,date:now,by:user.displayName,byId:user.userId,materialId:item.materialId||''};
 request.receipts??=[];request.receipts.push(receipt);request.history??=[];request.history.unshift({date:now,by:user.displayName,byId:user.userId,status:'Entrada no estoque',note:'NF '+invoice.number+' / Pedido '+order.orderNumber+' / Item '+order.orderItem+' / '+qty+' '+item.unit});return {request,item,order,receipt};
}
