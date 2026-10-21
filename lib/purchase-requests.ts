export function isOpenPurchase(request:any):boolean{return request.status==='Solicitada'||request.status==='Em compra';}
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
 const request={id:crypto.randomUUID(),number:'RC-'+String(version).padStart(6,'0'),project,reference,notes:text(body.notes),priority:body.priority==='Urgente'?'Urgente':'Normal',items,status:'Solicitada',createdAt:now,createdBy:user.displayName,createdById:user.userId};
 data.purchaseRequests.unshift(request);return request;
}

export function updatePurchase(data:any,user:any,body:any,now:string){
 const request=data.purchaseRequests.find((p:any)=>p.id===body.purchaseId);if(!request||!isOpenPurchase(request))throw Error('Compra não encontrada ou já encerrada.');
 const status=body.action==='cancel-purchase'?'Cancelada':body.status;
 if(!['Em compra','Encerrada','Cancelada'].includes(status))throw Error('Situação de compra inválida.');
 const note=String(body.note??'').trim().slice(0,500);
 if((status==='Encerrada'||status==='Cancelada')&&!note)throw Error('Informe a referência do recebimento ou a justificativa do encerramento/cancelamento.');
 request.history??=[];request.history.unshift({date:now,by:user.displayName,status,note});request.status=status;request.updatedAt=now;request.updatedBy=user.displayName;
 // Closing a purchase tracks procurement only; the stock changes exclusively through invoice receiving.
 for(const r of data.replenishments||[]){if(r.purchaseRequestId===request.id&&!isOpenPurchase(request)){r.status=status==='Cancelada'?'Cancelada':'Encerrada';r.closedAt=now;r.closedBy=user.displayName;}}
}
