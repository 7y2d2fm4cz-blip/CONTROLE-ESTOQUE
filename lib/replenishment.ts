export function isBelowMinimum(material:any):boolean {
 return Number(material.minimum)>0&&Number(material.qty)<Number(material.minimum);
}
export function isOpenReplenishment(request:any):boolean {
 return request.status==='Definir quantidade'||request.status==='Solicitada';
}
// Called inside the same versioned transaction as each stock or minimum change.
export function syncReplenishments(data:any,version:number,now:string) {
 data.replenishments??=[];
 for(const material of data.materials){
  const open=data.replenishments.find((r:any)=>r.materialId===material.id&&isOpenReplenishment(r));
  if(isBelowMinimum(material)&&!open){
   data.replenishments.unshift({id:crypto.randomUUID(),number:'RP-'+String(version).padStart(6,'0')+'-'+String(data.replenishments.length+1).padStart(3,'0'),materialId:material.id,code:material.code,description:material.description,unit:material.unit,project:material.project,location:material.location,minimumAtCreation:material.minimum,balanceAtCreation:material.qty,qty:null,status:'Definir quantidade',createdAt:now,createdBy:'Estoque mínimo',notes:''});
  }else if(open?.status==='Definir quantidade'&&!isBelowMinimum(material)){
   open.status='Regularizada';open.closedAt=now;open.closedBy='Estoque mínimo';
  }
 }
}
