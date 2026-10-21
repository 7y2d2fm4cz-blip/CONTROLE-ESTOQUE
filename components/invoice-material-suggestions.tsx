'use client';
import {suggestInvoiceMaterials} from '../lib/material-search';
export default function InvoiceMaterialSuggestions({materials,line,project,disabled,onSelect}:{materials:any[];line:any;project:string;disabled:boolean;onSelect:(id:string)=>void}){
 if(disabled||line.purchaseId)return null;
 const suggestions=suggestInvoiceMaterials(materials,line,project);
 const linked=materials.find(m=>m.id===line.materialId);
 if(linked)return <div className="materialMatch linked"><strong>Vinculado ao cadastro</strong><span>{linked.description} · {linked.code||'Sem código'}</span><small>A entrada será somada ao saldo deste material.</small></div>;
 return <div className="materialMatch">{suggestions.length?<><strong>Materiais semelhantes</strong>{suggestions.map(s=><div key={s.material.id}><span>{s.material.description}</span><small>{s.material.code||'Sem código'} · {s.material.unit} · {s.material.location||'A definir'} · {s.reason}</small><button type="button" onClick={()=>onSelect(s.material.id)}>Usar este material</button></div>)}<small>Confirme o vínculo somente se forem o mesmo material e especificação.</small></>:<small>{project?'Sem sugestão compatível. Você pode escolher um vínculo na lista ou manter um novo cadastro.':'Selecione a obra para consultar materiais semelhantes.'}</small>}</div>;
}
