import fs from 'node:fs';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
// Reject damaged UTF-8 before building or publishing user-facing text.
for (const path of ['app/page.tsx','app/api/stock/route.ts','app/api/extract/route.ts','components/stock-requisition.tsx','components/requisition-history.tsx','lib/material-search.ts','lib/access-control.ts','components/access-management.tsx','README.md']) {
 const text=new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(path));
 assert.ok(!text.includes('\uFFFD'),`Texto com caracteres corrompidos: ${path}`);
 assert.ok(!/Ã[\u0080-\u00bf]|Â[\u0080-\u00bf]|â[\u0080-\u00bf]/u.test(text),`Codificação duplicada: ${path}`);
}
console.log('PASS: textos em UTF-8 sem caracteres corrompidos.');
const sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE inventory_store(id TEXT PRIMARY KEY,version INTEGER NOT NULL,data TEXT NOT NULL)');
const db={prepare(sql){return {bind(...values){return {async first(){return sqlite.prepare(sql).get(...values)},async run(){const r=sqlite.prepare(sql).run(...values);return {meta:{changes:r.changes}}}}}}}};
globalThis.__testEnv={DB:db};
const adminUser={displayName:'Teste',userId:'test',email:'69tjwwwnrj@privaterelay.appleid.com',fullName:'Teste'};
globalThis.__testUser=adminUser;
const accessCompiled=ts.transpileModule(fs.readFileSync('lib/access-control.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
globalThis.__testAccess=await import('data:text/javascript;base64,'+Buffer.from(accessCompiled).toString('base64'));

let source=fs.readFileSync('app/api/stock/route.ts','utf8').replace(/import \{env\} from 'cloudflare:workers';/, 'const env=globalThis.__testEnv;').replace(/import \{getChatGPTUser\} from '..\/..\/chatgpt-auth';/, 'const getChatGPTUser=async()=>globalThis.__testUser;');
source=source.replace("import {presentStock,canPerform,bindMember,manageUser,ensureAccess} from '../../../lib/access-control';",'const {presentStock,canPerform,bindMember,manageUser,ensureAccess}=globalThis.__testAccess;');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const api=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const post=async body=>{const r=await api.POST(new Request('https://stock.test/api/stock',{method:'POST',headers:{origin:'https://stock.test','Content-Type':'application/json'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()}};
const invoice={orderNumber:'000123',number:'1',supplier:'Fornecedor teste',taxId:'123',series:'1',project:'Obra teste',items:[{orderItem:'00010',description:'Cabo',unit:'M',qty:100,price:12}]};
for(const bad of [{...invoice,orderNumber:''},{...invoice,orderNumber:'   '},{...invoice,items:[{...invoice.items[0],orderItem:''}]},{...invoice,items:[invoice.items[0],{...invoice.items[0],orderItem:'   '}]}]){const rejected=await post({action:'receive',version:0,invoice:bad});assert.equal(rejected.status,400);assert.match(rejected.body.error,/pedido/);const before=await (await api.GET()).json();assert.equal(before.version,0);assert.equal(before.materials.length,0);}
let r=await post({action:'receive',version:0,invoice});assert.equal(r.status,200);assert.equal(r.body.materials[0].qty,100);assert.equal(r.body.invoices[0].orderNumber,'000123');assert.equal(r.body.invoices[0].items[0].orderItem,'00010');assert.equal(r.body.moves[0].orderItem,'00010');const id=r.body.materials[0].id;
r=await post({action:'receive',version:1,invoice});assert.equal(r.status,400);assert.match(r.body.error,/duplicada/);
r=await post({action:'out',version:1,materialId:id,qty:101,person:'João',reference:'Frente A'});assert.equal(r.status,400);
r=await post({action:'out',version:1,materialId:id,qty:25,person:'João',reference:'Frente A'});assert.equal(r.status,200);assert.equal(r.body.materials[0].qty,75);
r=await post({action:'out',version:1,materialId:id,qty:5,person:'João',reference:'Frente A'});assert.equal(r.status,400);assert.match(r.body.error,/atualizado/);
r=await post({action:'receive',version:2,invoice:{...invoice,number:'2',items:[{...invoice.items[0],materialId:id,qty:25,price:20}]}});assert.equal(r.status,200);assert.equal(r.body.materials[0].qty,100);assert.equal(r.body.materials[0].average,14);
r=await post({action:'receive',version:3,invoice:{...invoice,number:'3',items:[invoice.items[0],{description:'Inválido',qty:-1,unit:'UN',price:1}]}});assert.equal(r.status,400);const state=await (await api.GET()).json();assert.equal(state.materials[0].qty,100);assert.equal(state.version,3);
console.log('PASS: entrada, duplicidade, saldo insuficiente, saída, concorrência, custo médio e atomicidade.');

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
console.log('PASS: cadastros, duplicidade, renomeação vinculada, chave repetida, chave incompleta e recebimento sem chave.');
for(const project of ['', 'Obra inexistente']){
 r=await send({action:'shelf',name:'B-01',project});assert.equal(r.status,400);assert.match(r.body.error,/obra cadastrada/);
}
r=await send({action:'project',name:'Segunda obra'});assert.equal(r.status,200);
r=await send({action:'shelf',name:'A-02',project:'Segunda obra'});assert.equal(r.status,200);
assert.equal(r.body.shelves.filter(s=>s.name==='A-02').length,2);
console.log('PASS: prateleiras exigem obra válida e permitem nomes iguais em obras diferentes.');

// Search must handle accents, word order, fragments and formatted material codes.
const searchSource=fs.readFileSync('lib/material-search.ts','utf8');
const searchCompiled=ts.transpileModule(searchSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {matchesMaterial,searchMaterials}=await import('data:text/javascript;base64,'+Buffer.from(searchCompiled).toString('base64'));
const sample={code:'CB-001.16',description:'Cabo elétrico de cobre 16 mm²',project:'Obra São João',location:'Prateleira A-02',unit:'M'};
for(const query of ['eletrico cabo','COBRE 16','sao joao','cb00116','A02 cabo','  cabo   cobre  '])assert.ok(matchesMaterial(sample,query),query);
assert.ok(!matchesMaterial(sample,'cabo aluminio'));
assert.equal(searchMaterials([{...sample,id:'other',code:'X'},{...sample,id:'exact'}],'CB00116')[0].id,'exact');
console.log('PASS: busca sem acentos, palavras fora de ordem e códigos com separadores.');

// Multiple-item requisitions: pending requests never change stock or reserve it.
r=await send({action:'receive',invoice:{...invoice,number:'REQ-TEST',items:[{...invoice.items[0],code:'CON-002',description:'Conector elétrico',unit:'UN',qty:10,price:5}]}});assert.equal(r.status,200);
const secondId=r.body.materials.find(m=>m.code==='CON-002').id;
const beforeRequest=await (await api.GET()).json();
const requestBody={action:'request',person:'João',reference:'Montagem — Área 2',items:[{materialId:id,qty:4},{materialId:secondId,qty:3}]};
for(const items of [[],[{materialId:id,qty:0}],[{materialId:id,qty:-1}],[{materialId:id,qty:Infinity}],[{materialId:'missing',qty:1}],[{materialId:secondId,qty:11}],[{materialId:id,qty:1},{materialId:id,qty:1}]]){
 r=await send({...requestBody,items});assert.equal(r.status,400);assert.equal((await (await api.GET()).json()).version,v);
}
r=await send({...requestBody,person:' '});assert.equal(r.status,400);
const otherMaterial=beforeRequest.materials.find(m=>m.project==='Obra renomeada');
r=await send({...requestBody,items:[{materialId:id,qty:1},{materialId:otherMaterial.id,qty:1}]});assert.equal(r.status,400);
r=await send(requestBody);assert.equal(r.status,200);const requestId=r.body.requests[0].id;
assert.match(r.body.requests[0].number,/^RQ-\d{6,}$/);assert.equal(r.body.requests[0].status,'Pendente');
assert.deepEqual(r.body.materials,beforeRequest.materials);assert.deepEqual(r.body.moves,beforeRequest.moves);
const requestVersion=v;
r=await send({...requestBody,items:[{materialId:id,qty:2},{materialId:secondId,qty:10}]});assert.equal(r.status,200);const competingId=r.body.requests[0].id;
assert.deepEqual(r.body.materials,beforeRequest.materials);
r=await post({action:'fulfill-request',requestId,version:requestVersion});assert.equal(r.status,400);assert.match(r.body.error,/atualizado/);
r=await send({action:'fulfill-request',requestId});assert.equal(r.status,200);
assert.equal(r.body.materials.find(m=>m.id===id).qty,beforeRequest.materials.find(m=>m.id===id).qty-4);
assert.equal(r.body.materials.find(m=>m.id===secondId).qty,7);
assert.equal(r.body.requests.find(q=>q.id===requestId).status,'Atendida');
assert.equal(r.body.moves.filter(m=>m.requestId===requestId).length,2);
assert.ok(r.body.moves.filter(m=>m.requestId===requestId).every(m=>m.type==='Saída'&&m.person==='João'&&m.requestNumber));
const afterFulfill=r.body;
for(const action of ['fulfill-request','cancel-request']){r=await send({action,requestId});assert.equal(r.status,400);}
r=await send({action:'fulfill-request',requestId:competingId});assert.equal(r.status,400);assert.match(r.body.error,/Saldo insuficiente/);
assert.deepEqual((await (await api.GET()).json()),afterFulfill); // No partial decrement of the first valid line.
r=await send({action:'cancel-request',requestId:competingId});assert.equal(r.status,200);assert.equal(r.body.requests.find(q=>q.id===competingId).status,'Cancelada');assert.deepEqual(r.body.materials,afterFulfill.materials);
r=await send({action:'fulfill-request',requestId:competingId});assert.equal(r.status,400);
r=await send({...requestBody,items:[{materialId:otherMaterial.id,qty:1}]});assert.equal(r.status,200);const renameRequestId=r.body.requests[0].id;
r=await send({action:'project',id:projectId,name:'Obra final'});assert.equal(r.status,200);assert.equal(r.body.requests.find(q=>q.id===renameRequestId).project,'Obra final');
r=await send({action:'fulfill-request',requestId:renameRequestId});assert.equal(r.status,200);
console.log('PASS: requisição sem baixa, saldo concorrente, atendimento integral, histórico, cancelamento, renomeação e bloqueio de duplicidade.');

// Authorization is enforced by the API even when a caller forges UI roles or calls endpoints directly.
const reader={userId:'reader-1',email:'requisitante@example.com',displayName:'Requisitante',fullName:'Requisitante'};
const warehouseUser={userId:'warehouse-1',email:'almoxarife@example.com',displayName:'Almoxarife',fullName:'Almoxarife'};
const stranger={userId:'stranger-1',email:'novo@example.com',displayName:'Novo usuário',fullName:'Novo usuário'};
const get=async()=>{const response=await api.GET();return {status:response.status,headers:response.headers,body:await response.json()};};
const persisted=()=>sqlite.prepare('SELECT data FROM inventory_store WHERE id=?').get('main').data;
const ownerBefore=await get();assert.equal(ownerBefore.body.session.role,'admin');assert.ok(ownerBefore.body.access);
r=await send({action:'manage-user',email:reader.email,name:'Requisitante',role:'requisitante',status:'active'});assert.equal(r.status,200);const readerMemberId=r.body.access.users.find(m=>m.email===reader.email).id;
r=await send({action:'manage-user',email:warehouseUser.email,name:'Almoxarife',role:'almoxarife',status:'active'});assert.equal(r.status,200);const warehouseMemberId=r.body.access.users.find(m=>m.email===warehouseUser.email).id;
const adminMemberId=r.body.access.users.find(m=>m.userId===adminUser.userId).id;
for(const body of [{id:adminMemberId,role:'requisitante',status:'active'},{id:adminMemberId,role:'admin',status:'blocked'},{email:'invalid',role:'admin',status:'active'},{email:'some@example.com',role:'owner',status:'active'},{email:reader.email,role:'admin',status:'active'}]){
 r=await send({action:'manage-user',...body});assert.equal(r.status,400);
}
globalThis.__testUser=reader;
let view=await get();assert.equal(view.body.session.role,'requisitante');assert.equal(view.headers.get('Cache-Control'),'private, no-store');assert.equal(view.body.access,undefined);assert.deepEqual(view.body.invoices,[]);assert.ok(view.body.materials.every(m=>!('average' in m)));assert.equal(view.body.requests.length,0);
const restrictedBefore=persisted();
for(const action of ['receive','out','material','project','shelf','fulfill-request','manage-user','unknown-action']){
 r=await send({action,role:'admin',session:{role:'admin'},userId:adminUser.userId,requestId});assert.equal(r.status,403,action);assert.equal(persisted(),restrictedBefore);
}
r=await send({...requestBody,items:[{materialId:id,qty:1}]});assert.equal(r.status,200);const ownRequest=r.body.requests[0];assert.equal(ownRequest.createdById,reader.userId);assert.ok(r.body.requests.every(q=>q.createdById===reader.userId));assert.equal(r.body.access,undefined);
globalThis.__testUser=warehouseUser;view=await get();assert.equal(view.body.session.role,'almoxarife');assert.equal(view.body.access,undefined);assert.ok(view.body.materials.some(m=>'average' in m));assert.ok(view.body.requests.some(q=>q.id===ownRequest.id));
r=await send({action:'manage-user',id:readerMemberId,role:'admin',status:'active'});assert.equal(r.status,403);
r=await send({action:'fulfill-request',requestId:ownRequest.id});assert.equal(r.status,200);
r=await send({action:'material',description:'Material autorizado',project:'Obra teste',unit:'UN'});assert.equal(r.status,200);
globalThis.__testUser=reader;view=await get();assert.ok(view.body.moves.every(m=>m.requestId===ownRequest.id));assert.ok(view.body.moves.length>0);
r=await send({...requestBody,items:[{materialId:id,qty:1}]});assert.equal(r.status,200);const pendingOwnId=r.body.requests[0].id;
globalThis.__testUser={...reader,userId:'impostor-1'};view=await get();assert.equal(view.body.session.role,null);assert.deepEqual(view.body.materials,[]); // A bound account cannot be taken over through its e-mail.
globalThis.__testUser=stranger;view=await get();assert.equal(view.body.session.status,'unregistered');assert.deepEqual(view.body.materials,[]);assert.deepEqual(view.body.requests,[]);
r=await send({action:'request',...requestBody});assert.equal(r.status,403);
r=await send({action:'request-access',role:'admin'});assert.equal(r.status,200);assert.equal(r.body.session.status,'pending');assert.equal(r.body.session.role,null);assert.deepEqual(r.body.materials,[]);
r=await send({action:'cancel-request',requestId:pendingOwnId});assert.equal(r.status,403);
r=await send({action:'request-access'});assert.equal(r.status,403);
globalThis.__testUser=adminUser;view=await get();const strangerMember=view.body.access.users.find(m=>m.userId===stranger.userId);assert.equal(strangerMember.role,'requisitante');assert.equal(strangerMember.status,'pending');
r=await send({action:'manage-user',id:strangerMember.id,role:'requisitante',status:'active'});assert.equal(r.status,200);
globalThis.__testUser=stranger;r=await send({action:'cancel-request',requestId:pendingOwnId});assert.equal(r.status,403);
globalThis.__testUser=reader;r=await send({action:'cancel-request',requestId:pendingOwnId});assert.equal(r.status,200);
globalThis.__testUser=adminUser;r=await send({action:'manage-user',id:readerMemberId,role:'requisitante',status:'blocked'});assert.equal(r.status,200);const revokedVersion=v;
globalThis.__testUser=reader;view=await get();assert.equal(view.body.session.status,'blocked');assert.equal(view.body.session.role,null);assert.deepEqual(view.body.materials,[]);r=await send(requestBody);assert.equal(r.status,403);
globalThis.__testUser=adminUser;r=await send({action:'manage-user',id:warehouseMemberId,role:'requisitante',status:'active'});assert.equal(r.status,200);
globalThis.__testUser=warehouseUser;r=await send({action:'fulfill-request',requestId});assert.equal(r.status,403);
// Extraction checks the same role before reading files, keys or calling any provider.
let extractSource=fs.readFileSync('app/api/extract/route.ts','utf8').replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__testEnv;').replace("import {getChatGPTUser} from '../../chatgpt-auth';",'const getChatGPTUser=async()=>globalThis.__testUser;').replace("import {canPerform} from '../../../lib/access-control';",'const {canPerform}=globalThis.__testAccess;');
const extractCompiled=ts.transpileModule(extractSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const extractApi=await import('data:text/javascript;base64,'+Buffer.from(extractCompiled).toString('base64'));
for(const user of [reader,warehouseUser,stranger]){globalThis.__testUser=user;assert.equal((await extractApi.POST(new Request('https://stock.test/api/extract',{method:'POST',headers:{origin:'https://stock.test'}}))).status,403);}
globalThis.__testUser=null;assert.equal((await api.GET()).status,401);assert.equal((await post({action:'request-access',version:v})).status,401);
globalThis.__testUser=adminUser;view=await get();assert.ok(view.body.access.log.length>=5);assert.ok(v>revokedVersion);
console.log('PASS: administrador, requisitante e almoxarife; aprovação, bloqueio, identidade estável, dados filtrados e proteção de todas as operações.');
