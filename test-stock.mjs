import fs from 'node:fs';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
const sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE inventory_store(id TEXT PRIMARY KEY,version INTEGER NOT NULL,data TEXT NOT NULL)');
const db={prepare(sql){return {bind(...values){return {async first(){return sqlite.prepare(sql).get(...values)},async run(){const r=sqlite.prepare(sql).run(...values);return {meta:{changes:r.changes}}}}}}}};
globalThis.__testEnv={DB:db};
let source=fs.readFileSync('app/api/stock/route.ts','utf8').replace(/import \{env\} from 'cloudflare:workers';/, 'const env=globalThis.__testEnv;').replace(/import \{getChatGPTUser\} from '..\/..\/chatgpt-auth';/, 'const getChatGPTUser=async()=>({displayName:"Teste",userId:"test"});');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const api=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const post=async body=>{const r=await api.POST(new Request('https://stock.test/api/stock',{method:'POST',headers:{origin:'https://stock.test','Content-Type':'application/json'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()}};
const invoice={orderNumber:'000123',number:'1',supplier:'Fornecedor teste',taxId:'123',series:'1',project:'Obra teste',items:[{orderItem:'00010',description:'Cabo',unit:'M',qty:100,price:12}]};
for(const bad of [{...invoice,orderNumber:''},{...invoice,orderNumber:'   '},{...invoice,items:[{...invoice.items[0],orderItem:''}]},{...invoice,items:[invoice.items[0],{...invoice.items[0],orderItem:'   '}]}]){const rejected=await post({action:'receive',version:0,invoice:bad});assert.equal(rejected.status,400);assert.match(rejected.body.error,/pedido/);const before=await (await api.GET()).json();assert.equal(before.version,0);assert.equal(before.materials.length,0);}
let r=await post({action:'receive',version:0,invoice});assert.equal(r.status,200);assert.equal(r.body.materials[0].qty,100);assert.equal(r.body.invoices[0].orderNumber,'000123');assert.equal(r.body.invoices[0].items[0].orderItem,'00010');assert.equal(r.body.moves[0].orderItem,'00010');const id=r.body.materials[0].id;
r=await post({action:'receive',version:1,invoice});assert.equal(r.status,400);assert.match(r.body.error,/duplicada/);
r=await post({action:'out',version:1,materialId:id,qty:101,person:'Jo�o',reference:'Frente A'});assert.equal(r.status,400);
r=await post({action:'out',version:1,materialId:id,qty:25,person:'Jo�o',reference:'Frente A'});assert.equal(r.status,200);assert.equal(r.body.materials[0].qty,75);
r=await post({action:'out',version:1,materialId:id,qty:5,person:'Jo�o',reference:'Frente A'});assert.equal(r.status,400);assert.match(r.body.error,/atualizado/);
r=await post({action:'receive',version:2,invoice:{...invoice,number:'2',items:[{...invoice.items[0],materialId:id,qty:25,price:20}]}});assert.equal(r.status,200);assert.equal(r.body.materials[0].qty,100);assert.equal(r.body.materials[0].average,14);
r=await post({action:'receive',version:3,invoice:{...invoice,number:'3',items:[invoice.items[0],{description:'Inv�lido',qty:-1,unit:'UN',price:1}]}});assert.equal(r.status,400);const state=await (await api.GET()).json();assert.equal(state.materials[0].qty,100);assert.equal(state.version,3);
console.log('PASS: entrada, duplicidade, saldo insuficiente, sa�da, concorr�ncia, custo m�dio e atomicidade.');

let v=3;
const send=async b=>{const r=await post({...b,version:v});if(r.status===200)v=r.body.version;return r;};
r=await send({action:'project',name:'Obra nova',code:'P01'});assert.equal(r.status,200);const projectId=r.body.projects.find(p=>p.name==='Obra nova').id;
r=await send({action:'shelf',name:'A-01',project:'Obra nova'});assert.equal(r.status,200);const shelfId=r.body.shelves.find(s=>s.name==='A-01').id;
r=await send({action:'shelf',name:'A-01',project:'Obra nova'});assert.equal(r.status,400);
const validKey='33251057158057000645550010006699861176088530';
r=await send({action:'receive',invoice:{...invoice,number:'669986',project:'Obra nova',key:validKey+validKey,items:[{...invoice.items[0],location:'A-01'}]}});assert.equal(r.status,200);assert.equal(r.body.invoices[0].key,validKey);
r=await send({action:'receive',invoice:{...invoice,number:'669986',project:'Obra nova',key:'',withoutKey:true}});assert.equal(r.status,400);
r=await send({action:'receive',invoice:{...invoice,number:'44',key:'12345'}});assert.equal(r.status,400);
r=await send({action:'receive',invoice:{...invoice,number:'44',key:'12345',withoutKey:true}});assert.equal(r.status,200);assert.equal(r.body.invoices[0].key,'');
r=await send({action:'project',id:projectId,name:'Obra renomeada'});assert.equal(r.status,200);assert.equal(r.body.shelves.find(s=>s.id===shelfId).project,'Obra renomeada');
r=await send({action:'shelf',id:shelfId,name:'A-02',project:'Obra renomeada'});assert.equal(r.status,200);assert.ok(r.body.materials.some(m=>m.project==='Obra renomeada'&&m.location==='A-02'));
console.log('PASS: cadastros, duplicidade, renomea��o vinculada, chave repetida, chave incompleta e recebimento sem chave.');
for(const project of ['', 'Obra inexistente']){
 r=await send({action:'shelf',name:'B-01',project});assert.equal(r.status,400);assert.match(r.body.error,/obra cadastrada/);
}
r=await send({action:'project',name:'Segunda obra'});assert.equal(r.status,200);
r=await send({action:'shelf',name:'A-02',project:'Segunda obra'});assert.equal(r.status,200);
assert.equal(r.body.shelves.filter(s=>s.name==='A-02').length,2);
console.log('PASS: prateleiras exigem obra v�lida e permitem nomes iguais em obras diferentes.');
