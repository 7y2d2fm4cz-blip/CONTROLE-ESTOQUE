export function normalizeSearch(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Match every word independently, so order, accents and code separators do not block a result.
export function matchesMaterial(material: any, query: string): boolean {
  const fields = [material.code, material.description, material.project, material.location, material.unit].map(normalizeSearch);
  const text = fields.join(' ');
  const compact = fields.map(value => value.replace(/ /g, ''));
  return normalizeSearch(query).split(/\s+/).filter(Boolean).every(word => text.includes(word) || compact.some(field => field.includes(word)));
}

export function searchMaterials(materials: any[], query: string): any[] {
  const normalized = normalizeSearch(query).replace(/ /g, '');
  const score = (m: any) => normalized && normalizeSearch(m.code).replace(/ /g, '') === normalized ? 2 : normalized && normalizeSearch(m.description).startsWith(normalizeSearch(query)) ? 1 : 0;
  return materials.filter(m => matchesMaterial(m, query)).sort((a, b) => score(b) - score(a) || a.description.localeCompare(b.description, 'pt-BR', {sensitivity:'base', numeric:true}));
}

// Suggestions never bind a material automatically. Numeric specifications must agree.
export function suggestInvoiceMaterials(materials:any[],line:any,project:string){
 if(!project||!String(line.description||'').trim()||!String(line.unit||'').trim())return [];
 const canonical=(value:any)=>String(value??'').toLowerCase().replace(/mm[²2]/g,'mm').replace(/(\d)[,.](\d)/g,'$1.$2');
 const numbers=(value:any)=>Array.from(new Set((canonical(value).match(/\d+(?:\.\d+)?/g)||[]).map(n=>String(Number(n))))).sort().join('|');
 const words=(value:any)=>normalizeSearch(canonical(value)).split(/\s+/).filter(w=>w.length>1&&!['de','da','do','das','dos','com','para','tipo'].includes(w)).map(w=>({flex:'flexivel',eletr:'eletrico',conect:'conector',term:'terminal'}[w]||w));
 const bigrams=(s:string)=>{const set=new Set<string>();for(let i=0;i<s.length-1;i++)set.add(s.slice(i,i+2));return set;};
 const query=words(line.description),queryText=query.join(' '),queryGrams=bigrams(queryText),spec=numbers(line.description),code=normalizeSearch(line.code).replace(/ /g,'');
 return materials.filter(m=>m.project===project&&m.unit===String(line.unit).trim().toUpperCase()).map(m=>{
  const candidate=words(m.description),candidateText=candidate.join(' '),candidateSpec=numbers(m.description),exactCode=!!code&&normalizeSearch(m.code).replace(/ /g,'')===code;
  if(spec&&candidateSpec&&spec!==candidateSpec)return null;
  const overlap=query.filter(w=>candidate.includes(w)).length;const tokenScore=2*overlap/(query.length+candidate.length||1);const grams=bigrams(candidateText);const common=[...queryGrams].filter(g=>grams.has(g)).length;const gramScore=2*common/(queryGrams.size+grams.size||1);
  const score=exactCode?1:queryText===candidateText?0.99:tokenScore*0.7+gramScore*0.3;
  if(!exactCode&&(score<0.48||!overlap))return null;
  return {material:m,score,reason:exactCode?'Mesmo código':queryText===candidateText?'Mesma descrição normalizada':'Descrição semelhante; confira a especificação'};
 }).filter((s):s is {material:any;score:number;reason:string}=>s!==null).sort((a,b)=>b.score-a.score||a.material.description.localeCompare(b.material.description,'pt-BR')).slice(0,3);
}
