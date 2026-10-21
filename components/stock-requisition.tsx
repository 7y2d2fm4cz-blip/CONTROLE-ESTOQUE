'use client';
import {useState} from 'react';
import {Search, Plus, X, ArrowUpFromLine} from 'lucide-react';
import {searchMaterials} from '../lib/material-search';

const qty = (n:number) => Number(n).toLocaleString('pt-BR',{maximumFractionDigits:3});
type Props = {materials:any[]; projects:string[]; defaultProject:string; initialMaterial?:any; busy:boolean; onSubmit:(body:any)=>void; onRefresh:()=>void};

export default function StockRequisition({materials,projects,defaultProject,initialMaterial,busy,onSubmit,onRefresh}:Props) {
  const [query,setQuery]=useState('');
  const [project,setProject]=useState(initialMaterial?.project||defaultProject);
  const [location,setLocation]=useState('');
  const [available,setAvailable]=useState(true);
  const [limit,setLimit]=useState(30);
  const [items,setItems]=useState<any[]>(initialMaterial?[{materialId:initialMaterial.id,qty:Math.min(1,initialMaterial.qty)}]:[]);
  const [person,setPerson]=useState('');
  const [reference,setReference]=useState('');
  const [notes,setNotes]=useState('');
  const locations=Array.from(new Set(materials.filter(m=>!project||m.project===project).map(m=>m.location).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const results=searchMaterials(materials.filter(m=>(!project||m.project===project)&&(!location||m.location===location)&&(!available||m.qty>0)),query);
  const valid=items.length>0&&!!person.trim()&&!!reference.trim()&&items.every(i=>{const m=materials.find(m=>m.id===i.materialId);return m&&Number.isFinite(Number(i.qty))&&Number(i.qty)>0&&Number(i.qty)<=m.qty;});
  function add(m:any){if(items.some(i=>i.materialId===m.id))return;setProject(m.project);setLocation('');setItems([...items,{materialId:m.id,qty:Math.min(1,m.qty)}]);}
  return <form onSubmit={e=>{e.preventDefault();if(valid)onSubmit({action:'request',person,reference,notes,items:items.map(i=>({...i,qty:Number(i.qty)}))});}}>
    <div className="alert info">Busque os materiais e monte sua requisição. O saldo será baixado somente quando a retirada for confirmada em Requisições.</div>
    <div className="requestFilters">
      <label>Obra<select aria-label="Obra da requisição" disabled={busy||items.length>0} value={project} onChange={e=>{setProject(e.target.value);setLocation('');setLimit(30)}}><option value="">Todas as obras</option>{projects.map(p=><option key={p}>{p}</option>)}</select></label>
      <label>Prateleira<select aria-label="Filtrar prateleira" value={location} disabled={busy} onChange={e=>{setLocation(e.target.value);setLimit(30)}}><option value="">Todas as prateleiras</option>{locations.map(p=><option key={p}>{p}</option>)}</select></label>
    </div>
    <div className="requestSearch"><Search size={20}/><input autoFocus aria-label="Pesquisar material para requisição" placeholder="Descrição, código, obra ou prateleira. Ex.: cabo cobre 16" value={query} disabled={busy} onChange={e=>{setQuery(e.target.value);setLimit(30)}}/>{query&&<button type="button" aria-label="Limpar pesquisa" onClick={()=>setQuery('')}><X size={16}/></button>}</div>
    <div className="requestResultHeader"><span>{results.length} materiais encontrados</span><label className="check"><input type="checkbox" checked={available} onChange={e=>setAvailable(e.target.checked)}/> Somente com saldo</label></div>
    <div className="tableScroll requestResults"><table><thead><tr><th>Material / código</th><th>Obra / prateleira</th><th>Disponível</th><th></th></tr></thead><tbody>{results.slice(0,limit).map(m=><tr key={m.id}><td><strong>{m.description}</strong><small>{m.code||'Sem código'}</small></td><td>{m.project}<small>{m.location||'A definir'}</small></td><td><strong>{qty(m.qty)} {m.unit}</strong></td><td><button type="button" disabled={busy||m.qty<=0||items.some(i=>i.materialId===m.id)} onClick={()=>add(m)}><Plus size={15}/>{items.some(i=>i.materialId===m.id)?'Adicionado':m.qty>0?'Adicionar':'Sem saldo'}</button></td></tr>)}</tbody></table>{!results.length&&<p className="empty">Nenhum material encontrado. Tente menos palavras ou ajuste os filtros.</p>}</div>
    {results.length>limit&&<button className="moreResults" type="button" onClick={()=>setLimit(limit+30)}>Mostrar mais materiais</button>}
    <div className="requestCart"><h3>Itens da requisição <span className="badge green">{items.length}</span></h3><p>Uma obra por requisição. Remova os itens para selecionar outra obra. Requisições pendentes não reservam saldo.</p>
      {!items.length?<p className="empty">Adicione os materiais encontrados acima.</p>:<div className="tableScroll"><table><thead><tr><th>Material / prateleira</th><th>Saldo atual</th><th>Quantidade solicitada</th><th>Saldo após retirada</th><th></th></tr></thead><tbody>{items.map((i,index)=>{const m=materials.find(m=>m.id===i.materialId);const invalid=!m||!Number.isFinite(Number(i.qty))||Number(i.qty)<=0||Number(i.qty)>m.qty;return <tr key={i.materialId}><td><strong>{m?.description||'Material indisponível'}</strong><small>{m?.code||'Sem código'} · {m?.location||'A definir'}</small></td><td>{qty(m?.qty||0)} {m?.unit}</td><td><label className="requestQuantity"><input aria-label={'Quantidade solicitada de '+(m?.description||'material')} type="number" required min="0.001" max={m?.qty||0} step="any" disabled={busy} value={i.qty} aria-invalid={invalid} onChange={e=>setItems(items.map((item,j)=>j===index?{...item,qty:e.target.value}:item))}/><span>{m?.unit}</span></label>{invalid&&<small className="quantityError">Informe uma quantidade positiva dentro do saldo.</small>}</td><td>{m?qty(m.qty-Number(i.qty||0)):'—'} {m?.unit}</td><td><button type="button" aria-label={'Remover '+(m?.description||'material')} disabled={busy} onClick={()=>setItems(items.filter((_,j)=>j!==index))}><X size={16}/></button></td></tr>})}</tbody></table></div>}
    </div>
    <div className="formGrid requestDetails"><label>Solicitante / responsável pela retirada *<input required maxLength={500} value={person} disabled={busy} onChange={e=>setPerson(e.target.value)}/></label><label>Destino / frente de serviço *<input required maxLength={500} placeholder="Ex.: Montagem elétrica — Área 2" value={reference} disabled={busy} onChange={e=>setReference(e.target.value)}/></label><label>Observações<input maxLength={500} value={notes} disabled={busy} onChange={e=>setNotes(e.target.value)}/></label></div>
    <div className="dialogFoot"><button type="button" disabled={busy} onClick={onRefresh}>Atualizar saldos</button><button type="submit" className="primary" disabled={busy||!valid}><ArrowUpFromLine size={17}/>{busy?'Salvando...':'Enviar requisição'}</button></div>
  </form>;
}
