export const materialHeaders=['Código','Descrição','Unidade','Obra','Prateleira','Estoque mínimo'];
const normalize=(value:any)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const text=(value:any)=>typeof value==='string'||typeof value==='number'?String(value).trim():'';
export function parseMaterialCsv(input:string):string[][]{
 const source=input.replace(/^\uFEFF/,'').replace(/^sep=[;,\t]\r?\n/i,'');const first=source.split(/\r?\n/)[0]||'';
 const delimiter=first.includes(';')?';':first.includes('\t')?'\t':',';const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
 for(let i=0;i<source.length;i++){const c=source[i];if(quoted){if(c==='"'){if(source[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}
 else if(c==='"'&&!cell&&!closed)quoted=true;else if(c===delimiter){row.push(cell);cell='';closed=false;}else if(c==='\n'||c==='\r'){if(c==='\r'&&source[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';closed=false;}else{if(closed&&!/\s/.test(c))throw Error('CSV inválido: conteúdo após aspas.');if(!closed)cell+=c;}}
 if(quoted)throw Error('CSV inválido: campo com aspas não fechado.');if(cell||row.length){row.push(cell);rows.push(row);}return rows;
}
export function materialRowsFromGrid(grid:any[][],defaultProject=''){
 if(!grid.length)throw Error('A planilha está vazia.');const headers=grid[0].map(normalize);const allowed=materialHeaders.map(normalize);
 if(headers.some((h,index)=>h&&(!allowed.includes(h)||headers.indexOf(h)!==index)))throw Error('Use os cabeçalhos do modelo, sem colunas extras ou repetidas.');
 for(const required of ['descricao','unidade'])if(!headers.includes(required))throw Error('Cabeçalho obrigatório ausente: '+required+'. Baixe o modelo.');
 const at=(row:any[],name:string)=>row[headers.indexOf(name)]??'';
 const result=grid.slice(1).map((row,index)=>({row,index:index+2})).filter(({row})=>row.some(value=>value!==null&&value!==undefined&&String(value).trim()!==''));
 if(!result.length||result.length>500)throw Error('Preencha de 1 a 500 linhas por importação.');
 if(result.some(({row})=>row.some((v,i)=>!headers[i]&&v!=null&&String(v).trim()!=='')))throw Error('Há dados em coluna sem cabeçalho. Use o modelo.');
 return result.map(({row,index})=>({line:index,code:at(row,'codigo'),description:at(row,'descricao'),unit:at(row,'unidade'),project:at(row,'obra')||defaultProject,location:at(row,'prateleira'),minimum:at(row,'estoque minimo')}));
}
export function planMaterialImport(data:any,rows:any[]){
 if(!Array.isArray(rows)||!rows.length||rows.length>500)throw Error('Importe de 1 a 500 materiais por vez.');
 const seenCode=new Set<string>(),seenDescription=new Set<string>();
 return rows.map((row,index)=>{
  const errors:string[]=[];const read=(key:string)=>{const value=row?.[key];if(value!=null&&typeof value!=='string'&&typeof value!=='number')errors.push('Valor inválido em '+key);const v=text(value);if(v.length>500)errors.push('Campo maior que 500 caracteres: '+key);if(/^[=+@]/.test(v))errors.push('Fórmulas não são aceitas: '+key);return v;};
  const code=read('code'),description=read('description'),unit=read('unit').toUpperCase(),projectInput=read('project'),locationInput=read('location'),minimumInput=read('minimum');
  const project=data.projects.find((p:any)=>normalize(p.name)===normalize(projectInput));
  const location=locationInput?data.shelves.find((s:any)=>s.project===project?.name&&normalize(s.name)===normalize(locationInput)):null;
  let minimum=0;if(row?.minimum===null)errors.push('Estoque mínimo inválido');if(minimumInput){const numeric=typeof row.minimum==='number'?row.minimum:minimumInput.includes(',')?minimumInput.replace(/\./g,'').replace(',','.'):minimumInput;minimum=Number(numeric);if(!Number.isFinite(minimum)||minimum<0)errors.push('Estoque mínimo deve ser um número maior ou igual a zero');}
  if(!description)errors.push('Informe a descrição');if(!unit)errors.push('Informe a unidade');if(!project)errors.push('Obra não cadastrada');if(locationInput&&!location)errors.push('Prateleira não cadastrada nesta obra');
  const item={code,description,unit,project:project?.name||projectInput,location:location?.name||'',minimum};
  const codeKey=normalize(item.project)+'|'+normalize(code),descriptionKey=normalize(item.project)+'|'+normalize(description)+'|'+unit;
  if(code&&seenCode.has(codeKey)||seenDescription.has(descriptionKey))errors.push('Material repetido na planilha');if(code)seenCode.add(codeKey);seenDescription.add(descriptionKey);
  const sameCode=code?data.materials.find((m:any)=>m.project===item.project&&normalize(m.code)===normalize(code)):null;
  const sameDescription=data.materials.find((m:any)=>m.project===item.project&&normalize(m.description)===normalize(description)&&m.unit===unit);
  if(sameCode&&(normalize(sameCode.description)!==normalize(description)||sameCode.unit!==unit))errors.push('Código já utilizado por outro material nesta obra');
  return {line:Number(row?.line)||index+2,item,status:errors.length?'error':sameCode||sameDescription?'existing':'new',message:errors.length?errors.join('; '):sameCode||sameDescription?'Já cadastrado; será ignorado, sem alterar saldo ou cadastro':'Novo cadastro com saldo zero'};
 });
}
export function importMaterials(data:any,user:any,body:any,now:string){
 const plan=planMaterialImport(data,body.items);const invalid=plan.filter(r=>r.status==='error');
 if(invalid.length)throw Error('Corrija a planilha. '+invalid.slice(0,5).map(r=>'Linha '+r.line+': '+r.message).join(' | '));
 const fresh=plan.filter(r=>r.status==='new');if(!fresh.length)throw Error('Nenhum material novo para importar. Os itens já estão cadastrados.');
 for(const row of fresh)data.materials.push({id:crypto.randomUUID(),...row.item,location:row.item.location||'A definir',qty:0,average:0,createdAt:now,createdBy:user.displayName,createdById:user.userId,importBatchId:body.batchId||undefined});
}
