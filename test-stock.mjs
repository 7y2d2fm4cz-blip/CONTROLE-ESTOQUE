import * as pdfLib from 'pdf-lib';
import fs from 'node:fs';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
// Reject damaged UTF-8 before building or publishing user-facing text.
for (const path of ['app/page.tsx','app/api/stock/route.ts','app/api/extract/route.ts','components/stock-requisition.tsx','components/requisition-history.tsx','lib/material-search.ts','lib/access-control.ts','lib/replenishment.ts','lib/purchase-requests.ts','lib/purchase-pdf.ts','app/api/purchase-pdf/route.ts','components/purchase-management.tsx','components/replenishment-management.tsx','components/access-management.tsx','components/purchase-execution.tsx','components/purchase-receipt-link.tsx','README.md']) {
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
const purchaseCompiled=ts.transpileModule(fs.readFileSync('lib/purchase-requests.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
globalThis.__testPurchases=await import('data:text/javascript;base64,'+Buffer.from(purchaseCompiled).toString('base64'));
const replenishmentCompiled=ts.transpileModule(fs.readFileSync('lib/replenishment.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
globalThis.__testReplenishment=await import('data:text/javascript;base64,'+Buffer.from(replenishmentCompiled).toString('base64'));
const accessCompiled=ts.transpileModule(fs.readFileSync('lib/access-control.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
globalThis.__testAccess=await import('data:text/javascript;base64,'+Buffer.from(accessCompiled).toString('base64'));

let source=fs.readFileSync('app/api/stock/route.ts','utf8').replace(/import \{env\} from 'cloudflare:workers';/, 'const env=globalThis.__testEnv;').replace(/import \{getChatGPTUser\} from '..\/..\/chatgpt-auth';/, 'const getChatGPTUser=async()=>globalThis.__testUser;');
source=source.replace("import {presentStock,canPerform,bindMember,manageUser,ensureAccess} from '../../../lib/access-control';",'const {presentStock,canPerform,bindMember,manageUser,ensureAccess}=globalThis.__testAccess;');
source=source.replace("import {syncReplenishments,isBelowMinimum,isOpenReplenishment} from '../../../lib/replenishment';",'const {syncReplenishments,isBelowMinimum,isOpenReplenishment}=globalThis.__testReplenishment;');
source=source.replace("import {createPurchase,updatePurchase,decidePurchase,recordPurchase,linkPurchaseReceipt,refreshPurchaseFulfillment} from '../../../lib/purchase-requests';",'const {createPurchase,updatePurchase,decidePurchase,recordPurchase,linkPurchaseReceipt,refreshPurchaseFulfillment}=globalThis.__testPurchases;');
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

// Minimum thresholds generate one draft per material, with no invented order quantity or stock change.
const {isBelowMinimum,isOpenReplenishment}=globalThis.__testReplenishment;
assert.equal(isBelowMinimum({qty:10,minimum:10}),false);assert.equal(isBelowMinimum({qty:0,minimum:0}),false);assert.equal(isBelowMinimum({qty:9,minimum:10}),true);
const minState=(await get()).body;const minItem=minState.materials.find(m=>m.id===id);const minMoves=minState.moves.length;
for(const minimum of [-1,null,'',Infinity]){r=await send({action:'set-minimum',materialId:id,minimum});assert.equal(r.status,400);}
r=await send({action:'set-minimum',materialId:id,minimum:minItem.qty});assert.equal(r.status,200);assert.equal(r.body.replenishments.filter(q=>q.materialId===id).length,0);
r=await send({action:'out',materialId:id,qty:1,person:'João',reference:'Teste de mínimo'});assert.equal(r.status,200);
let replenishment=r.body.replenishments.find(q=>q.materialId===id);assert.ok(replenishment);assert.equal(replenishment.status,'Definir quantidade');assert.equal(replenishment.qty,null);
assert.equal(r.body.materials.find(m=>m.id===id).qty,minItem.qty-1);assert.equal(r.body.moves.length,minMoves+1);
assert.equal((await get()).body.replenishments.filter(q=>q.materialId===id&&isOpenReplenishment(q)).length,1);
const minimumBefore=persisted();r=await send({action:'start-replenishment',materialId:id});assert.equal(r.status,400);assert.equal(persisted(),minimumBefore);
r=await send({action:'out',materialId:id,qty:1,person:'João',reference:'Nova saída'});assert.equal(r.status,200);assert.equal(r.body.replenishments.filter(q=>q.materialId===id&&isOpenReplenishment(q)).length,1);
const replenishmentId=replenishment.id;const balanceBeforeQuantity=r.body.materials.find(m=>m.id===id).qty;const movesBeforeQuantity=r.body.moves.length;
for(const quantity of [0,-1,null,'',Infinity]){r=await send({action:'submit-replenishment',replenishmentId,qty:quantity});assert.equal(r.status,400);}
r=await send({action:'submit-replenishment',replenishmentId,qty:125.5,notes:'Quantidade definida pelo almoxarife'});assert.equal(r.status,200);assert.equal(r.body.replenishments.find(q=>q.id===replenishmentId).qty,125.5);assert.equal(r.body.replenishments.find(q=>q.id===replenishmentId).status,'Solicitada');assert.equal(r.body.materials.find(m=>m.id===id).qty,balanceBeforeQuantity);assert.equal(r.body.moves.length,movesBeforeQuantity);
r=await send({action:'close-replenishment',replenishmentId});assert.equal(r.status,400);
r=await send({action:'receive',invoice:{...invoice,number:'REPO-1',items:[{...invoice.items[0],materialId:id,qty:2,price:14}]}});assert.equal(r.status,200);assert.equal(r.body.materials.find(m=>m.id===id).qty,minItem.qty);assert.equal(r.body.replenishments.find(q=>q.id===replenishmentId).status,'Solicitada');
r=await send({action:'close-replenishment',replenishmentId});assert.equal(r.status,200);assert.equal(r.body.replenishments.find(q=>q.id===replenishmentId).status,'Encerrada');
r=await send({action:'out',materialId:id,qty:0.5,person:'João',reference:'Novo ciclo'});assert.equal(r.status,200);const newDraft=r.body.replenishments.find(q=>q.materialId===id&&isOpenReplenishment(q));assert.ok(newDraft);assert.notEqual(newDraft.id,replenishmentId);assert.equal(newDraft.qty,null);
r=await send({action:'receive',invoice:{...invoice,number:'REPO-2',items:[{...invoice.items[0],materialId:id,qty:0.5,price:14}]}});assert.equal(r.status,200);assert.equal(r.body.replenishments.find(q=>q.id===newDraft.id).status,'Regularizada');
r=await send({action:'set-minimum',materialId:id,minimum:minItem.qty+1});assert.equal(r.status,200);const disabledDraft=r.body.replenishments.find(q=>q.materialId===id&&isOpenReplenishment(q));assert.ok(disabledDraft);
r=await send({action:'set-minimum',materialId:id,minimum:0});assert.equal(r.status,200);assert.equal(r.body.replenishments.find(q=>q.id===disabledDraft.id).status,'Regularizada');
globalThis.__testUser=warehouseUser;for(const action of ['set-minimum','start-replenishment','submit-replenishment','close-replenishment']){r=await send({action,materialId:id,minimum:10,replenishmentId,qty:3});assert.equal(r.status,403);}
view=await get();assert.deepEqual(view.body.replenishments,[]);
globalThis.__testUser=adminUser;r=await send({action:'manage-user',id:warehouseMemberId,role:'almoxarife',status:'active'});assert.equal(r.status,200);
globalThis.__testUser=warehouseUser;r=await send({action:'set-minimum',materialId:id,minimum:minItem.qty+5});assert.equal(r.status,200);const warehouseDraft=r.body.replenishments.find(q=>q.materialId===id&&isOpenReplenishment(q));assert.ok(warehouseDraft);
r=await send({action:'submit-replenishment',replenishmentId:warehouseDraft.id,qty:5});assert.equal(r.status,200);
globalThis.__testUser=adminUser;
console.log('PASS: mínimo estrito, alerta automático, quantidade a definir, prevenção de duplicidade, reposição sem alterar saldo, recebimento, novo ciclo e permissões.');

const fixtureApprover={userId:'fixture-approver',email:'fixture-aprovador@example.com',displayName:'Outro aprovador'};
r=await send({action:'manage-user',email:fixtureApprover.email,name:fixtureApprover.displayName,role:'aprovador',status:'active'});assert.equal(r.status,200);
async function approveOther(purchaseId){const previous=globalThis.__testUser;globalThis.__testUser=fixtureApprover;const result=await send({action:'approve-purchase',purchaseId});globalThis.__testUser=previous;return result;}
// Purchase requisitions are independent from withdrawals; minimum suggestions are live shortfalls.
const {minimumShortfall,isOpenPurchase}=globalThis.__testPurchases;
assert.equal(minimumShortfall({minimum:100,qty:35}),65);assert.equal(minimumShortfall({minimum:10,qty:10}),0);assert.equal(minimumShortfall({minimum:0,qty:0}),0);assert.equal(minimumShortfall({minimum:0.3,qty:0.1}),0.2);
const purchaseBefore=(await get()).body;const itemForPurchase=purchaseBefore.materials.find(m=>m.id===id);
const purchaseBody={action:'create-purchase',project:itemForPurchase.project,reference:'Recomposição do mínimo',priority:'Normal',items:[{materialId:id,qty:5,fromMinimum:true},{description:'Ferramenta nova',code:'F-01',unit:'UN',qty:2}]};
for(const bad of [{items:[]},{project:'Obra inexistente'},{reference:''},{items:[{materialId:'unknown',qty:1}]},{items:[{materialId:id,qty:0}]},{items:[{materialId:id,qty:-1}]},{items:[{materialId:id,qty:null}]},{items:[{materialId:id,qty:1},{materialId:id,qty:2}]},{items:[{description:'',unit:'UN',qty:1}]},{items:[{materialId:otherMaterial.id,qty:1}]}]){r=await send({...purchaseBody,...bad});assert.equal(r.status,400);}
r=await send(purchaseBody);assert.equal(r.status,200);const purchase=r.body.purchaseRequests[0];assert.match(purchase.number,/^RC-/);assert.equal(purchase.items.length,2);assert.equal(purchase.items[0].fromMinimum,true);assert.equal(purchase.items[1].materialId,'');assert.equal(purchase.createdById,adminUser.userId);assert.equal(purchase.status,'Aguardando aprovação');
assert.deepEqual(r.body.materials,purchaseBefore.materials);assert.deepEqual(r.body.moves,purchaseBefore.moves);assert.deepEqual(r.body.invoices,purchaseBefore.invoices);
assert.ok(r.body.replenishments.some(q=>q.materialId===id&&q.purchaseRequestId===purchase.id));
r=await send(purchaseBody);assert.equal(r.status,400);assert.match(r.body.error,/compra aberta/);
r=await send({action:'update-purchase',purchaseId:purchase.id,status:'Invalid'});assert.equal(r.status,400);
r=await approveOther(purchase.id);assert.equal(r.status,200);
r=await send({action:'update-purchase',purchaseId:purchase.id,status:'Em compra',note:'Cotação em andamento'});assert.equal(r.status,400);
r=await send({action:'update-purchase',purchaseId:purchase.id,status:'Encerrada',note:''});assert.equal(r.status,400);
r=await send({action:'cancel-purchase',purchaseId:purchase.id,note:'Revisar quantidade'});assert.equal(r.status,200);assert.equal(r.body.purchaseRequests[0].status,'Cancelada');assert.deepEqual(r.body.materials,purchaseBefore.materials);
assert.ok(r.body.replenishments.some(q=>q.materialId===id&&q.status==='Definir quantidade'&&!q.purchaseRequestId));
r=await send({...purchaseBody,items:[{materialId:id,qty:8,fromMinimum:true}]});assert.equal(r.status,200);const replacementPurchase=r.body.purchaseRequests[0];assert.equal(replacementPurchase.items[0].qty,8); // Suggested quantity remains editable.
r=await approveOther(replacementPurchase.id);assert.equal(r.status,200);
r=await send({action:'update-purchase',purchaseId:replacementPurchase.id,status:'Encerrada',note:'Processo encerrado para revisão, sem recebimento'});assert.equal(r.status,400);r=await send({action:'cancel-purchase',purchaseId:replacementPurchase.id,note:'Revisão'});assert.equal(r.status,200);assert.deepEqual(r.body.materials,purchaseBefore.materials);assert.ok(r.body.replenishments.some(q=>q.materialId===id&&q.status==='Definir quantidade'));
globalThis.__testUser=warehouseUser;r=await send({action:'create-purchase',project:itemForPurchase.project,reference:'Compra do almoxarife',items:[{materialId:id,qty:4}]});assert.equal(r.status,200);const warehousePurchase=r.body.purchaseRequests[0];
globalThis.__testUser=stranger;r=await send({action:'create-purchase',project:itemForPurchase.project,reference:'Necessidade nova',items:[{description:'Bancada nova',unit:'UN',qty:1}]});assert.equal(r.status,200);const requesterPurchase=r.body.purchaseRequests[0];assert.ok(r.body.purchaseRequests.every(p=>p.createdById===stranger.userId));assert.ok(!r.body.purchaseRequests.some(p=>p.id===warehousePurchase.id));
r=await send({action:'update-purchase',purchaseId:requesterPurchase.id,status:'Em compra'});assert.equal(r.status,403);
r=await send({action:'cancel-purchase',purchaseId:warehousePurchase.id,note:'Tentativa indevida'});assert.equal(r.status,403);
r=await send({action:'cancel-purchase',purchaseId:requesterPurchase.id,note:'Necessidade cancelada'});assert.equal(r.status,200);
r=await send({action:'create-purchase',project:itemForPurchase.project,reference:'Outra compra',items:[{description:'Item avulso',unit:'UN',qty:1}]});assert.equal(r.status,200);const committedPurchase=r.body.purchaseRequests[0];
globalThis.__testUser=adminUser;r=await send({action:'approve-purchase',purchaseId:committedPurchase.id});assert.equal(r.status,200);r=await send({action:'record-purchase',purchaseId:committedPurchase.id,supplier:'Fornecedor',orderNumber:'PC-LEGADO',items:[{purchaseItemId:committedPurchase.items[0].id,qty:1,orderItem:'10'}]});assert.equal(r.status,200);
globalThis.__testUser=stranger;r=await send({action:'cancel-purchase',purchaseId:committedPurchase.id,note:'Em andamento'});assert.equal(r.status,403);
globalThis.__testUser=reader;r=await send(purchaseBody);assert.equal(r.status,403);assert.deepEqual((await get()).body.purchaseRequests,[]);
globalThis.__testUser=adminUser;
console.log('PASS: compras com múltiplos itens e materiais novos, sugestão mínimo menos saldo, quantidade editável, duplicidade, histórico, cancelamento, segregação e nenhum efeito no estoque.');

// Approval is mandatory on the server, including direct PDF downloads and legacy purchases.
globalThis.__pdfLib=pdfLib;
const pdfSource=fs.readFileSync('lib/purchase-pdf.ts','utf8').replace("import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';",'const {PDFDocument,StandardFonts,rgb}=globalThis.__pdfLib;');
const pdfCompiled=ts.transpileModule(pdfSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
globalThis.__testPdf=await import('data:text/javascript;base64,'+Buffer.from(pdfCompiled).toString('base64'));
const routePdfSource=fs.readFileSync('app/api/purchase-pdf/route.ts','utf8').replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__testEnv;').replace("import {getChatGPTUser} from '../../chatgpt-auth';",'const getChatGPTUser=async()=>globalThis.__testUser;').replace("import {accessSession} from '../../../lib/access-control';",'const {accessSession}=globalThis.__testAccess;').replace("import {canExportPurchase} from '../../../lib/purchase-requests';",'const {canExportPurchase}=globalThis.__testPurchases;').replace("import {buildPurchasePdf} from '../../../lib/purchase-pdf';",'const {buildPurchasePdf}=globalThis.__testPdf;');
const routePdfCompiled=ts.transpileModule(routePdfSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const pdfApi=await import('data:text/javascript;base64,'+Buffer.from(routePdfCompiled).toString('base64'));
const download=async purchaseId=>pdfApi.GET(new Request('https://stock.test/api/purchase-pdf?purchaseId='+encodeURIComponent(purchaseId)));
const approverUser={userId:'approver-1',email:'aprovador@example.com',displayName:'Aprovador de Compras',fullName:'Aprovador de Compras'};
r=await send({action:'manage-user',email:approverUser.email,name:approverUser.displayName,role:'aprovador',status:'active'});assert.equal(r.status,200);const approverMemberId=r.body.access.users.find(m=>m.email===approverUser.email).id;
globalThis.__testUser=stranger;r=await send({action:'create-purchase',project:itemForPurchase.project,reference:'Teste do fluxo de aprovação',items:[{description:'Painel elétrico - proteção e medição',code:'PN-01',unit:'UN',qty:2}]});assert.equal(r.status,200);const approvalPurchaseId=r.body.purchaseRequests[0].id;assert.equal(r.body.purchaseRequests[0].status,'Aguardando aprovação');
assert.equal((await download(approvalPurchaseId)).status,403);
r=await send({action:'approve-purchase',purchaseId:approvalPurchaseId,role:'admin'});assert.equal(r.status,403);
globalThis.__testUser=warehouseUser;r=await send({action:'approve-purchase',purchaseId:approvalPurchaseId});assert.equal(r.status,403);
r=await send({action:'update-purchase',purchaseId:approvalPurchaseId,status:'Em compra'});assert.equal(r.status,403);globalThis.__testUser=adminUser;
r=await send({action:'update-purchase',purchaseId:approvalPurchaseId,status:'Encerrada',note:'Tentativa sem aprovação'});assert.equal(r.status,400);
globalThis.__testUser=approverUser;view=await get();assert.equal(view.body.session.role,'aprovador');assert.equal(view.body.session.canApprovePurchases,true);assert.equal(view.body.session.canOperateStock,false);assert.equal(view.body.access,undefined);assert.ok(view.body.materials.every(m=>!('average' in m)));assert.ok(view.body.purchaseRequests.some(p=>p.id===approvalPurchaseId));
const stockBeforeApproval=JSON.parse(persisted()).materials;
r=await send({action:'manage-user',email:'fake@example.com',role:'admin',status:'active'});assert.equal(r.status,403);
r=await send({action:'fulfill-request',requestId});assert.equal(r.status,403);
r=await send({action:'reject-purchase',purchaseId:approvalPurchaseId,note:' '});assert.equal(r.status,400);
r=await send({action:'approve-purchase',purchaseId:approvalPurchaseId,note:'Escopo e quantidades conferidos.'});assert.equal(r.status,200);const approvedPurchase=r.body.purchaseRequests.find(p=>p.id===approvalPurchaseId);assert.equal(approvedPurchase.status,'Aprovada');assert.equal(approvedPurchase.approvedById,approverUser.userId);assert.ok(approvedPurchase.approvedAt);assert.equal(approvedPurchase.approvalNote,'Escopo e quantidades conferidos.');assert.deepEqual(JSON.parse(persisted()).materials,stockBeforeApproval);
r=await send({action:'approve-purchase',purchaseId:approvalPurchaseId});assert.equal(r.status,400);
r=await send({action:'reject-purchase',purchaseId:approvalPurchaseId,note:'Repetida'});assert.equal(r.status,400);
r=await send({action:'update-purchase',purchaseId:approvalPurchaseId,status:'Em compra'});assert.equal(r.status,403);
let pdfResponse=await download(approvalPurchaseId);assert.equal(pdfResponse.status,200);assert.equal(pdfResponse.headers.get('content-type'),'application/pdf');assert.equal(pdfResponse.headers.get('cache-control'),'private, no-store');let pdfBytes=new Uint8Array(await pdfResponse.arrayBuffer());assert.equal(Buffer.from(pdfBytes.slice(0,5)).toString(),'%PDF-');assert.ok((await pdfLib.PDFDocument.load(pdfBytes)).getPageCount()>0);
globalThis.__testUser=stranger;assert.equal((await download(approvalPurchaseId)).status,200);assert.equal((await download(warehousePurchase.id)).status,404);
globalThis.__testUser=warehouseUser;r=await send({action:'update-purchase',purchaseId:approvalPurchaseId,status:'Em compra',note:'Compra liberada'});assert.equal(r.status,403);
globalThis.__testUser=adminUser;r=await send({action:'cancel-purchase',purchaseId:approvalPurchaseId,note:'Compra cancelada após análise'});assert.equal(r.status,200);assert.equal((await download(approvalPurchaseId)).status,403);
r=await send({action:'create-purchase',project:itemForPurchase.project,reference:'Reprovação',items:[{description:'Item a reprovar',unit:'UN',qty:1}]});assert.equal(r.status,200);const rejectedId=r.body.purchaseRequests[0].id;
globalThis.__testUser=approverUser;r=await send({action:'reject-purchase',purchaseId:rejectedId,note:'Especificação incompleta.'});assert.equal(r.status,200);assert.equal(r.body.purchaseRequests.find(p=>p.id===rejectedId).status,'Reprovada');assert.equal((await download(rejectedId)).status,403);
globalThis.__testUser=adminUser;r=await send({action:'manage-user',id:approverMemberId,role:'aprovador',status:'blocked'});assert.equal(r.status,200);
globalThis.__testUser=approverUser;r=await send({action:'approve-purchase',purchaseId:warehousePurchase.id});assert.equal(r.status,403);assert.equal((await download(approvalPurchaseId)).status,403);
globalThis.__testUser=null;assert.equal((await download(approvalPurchaseId)).status,401);
globalThis.__testUser=adminUser;
// A long multi-page specimen exercises page breaks, accents, approval metadata and long tokens.
const specimen={...approvedPurchase,number:'RC-EXEMPLO-APROVADO',project:'Obra de modernização elétrica - Área São João',reference:'Aquisição de materiais para proteção, medição e recomposição de estoque mínimo.',status:'Aprovada',notes:'Conferir as especificações técnicas e a identificação dos materiais antes da aquisição.',items:Array.from({length:55},(_,index)=>({id:String(index),description:index===10?'Especificação longa: '+('proteção elétrica e automação '.repeat(15)):'Material '+String(index+1).padStart(2,'0')+' - Conexão elétrica para instalação e proteção de painéis',code:'MAT-'+String(index+1).padStart(4,'0'),unit:'UN',qty:index+0.5,fromMinimum:index%2===0}))};
const specimenBytes=await globalThis.__testPdf.buildPurchasePdf(specimen);const specimenDoc=await pdfLib.PDFDocument.load(specimenBytes);assert.ok(specimenDoc.getPageCount()>=3);
fs.mkdirSync('.sites-runtime/pdf-qa',{recursive:true});fs.writeFileSync('.sites-runtime/pdf-qa/approved-purchase.pdf',specimenBytes);
console.log('PASS: perfil aprovador, aprovação/reprovação com auditoria, bloqueio antes da aprovação, PDF protegido por perfil e aprovação, acentos e paginação.');

// Procurement and receiving reconcile each approved line through the actual stock transaction.
const {purchaseItemProgress,purchaseQueue}=globalThis.__testPurchases;
const supplyUser={userId:'supply-1',email:'suprimentos@example.com',displayName:'Suprimentos'};
r=await send({action:'manage-user',email:supplyUser.email,name:supplyUser.displayName,role:'suprimentos',status:'active'});assert.equal(r.status,200);
globalThis.__testUser=supplyUser;view=await get();assert.equal(view.body.session.canBuy,true);assert.equal(view.body.session.canApprovePurchases,false);assert.equal(view.body.session.canOperateStock,false);assert.equal(view.body.access,undefined);assert.equal(view.body.invoices.length,0);assert.ok(view.body.materials.every(m=>!('average' in m)));
for(const action of ['approve-purchase','receive','manage-user','fulfill-request']){r=await send({action});assert.equal(r.status,403);}
globalThis.__testUser=adminUser;
r=await send({action:'create-purchase',project:itemForPurchase.project,reference:'Segregação do administrador',items:[{description:'Teste segregação',unit:'UN',qty:1}]});assert.equal(r.status,200);const selfId=r.body.purchaseRequests[0].id;
const beforeSelf=persisted();r=await send({action:'approve-purchase',purchaseId:selfId});assert.equal(r.status,400);assert.match(r.body.error,/outra pessoa/);assert.equal(persisted(),beforeSelf);
globalThis.__testUser=stranger;r=await send({action:'create-purchase',project:itemForPurchase.project,reference:'Compra e entrega parcial em duas linhas',items:[{materialId:id,qty:10},{description:'Válvula nova',code:'VL-NOVA',unit:'UN',qty:5}]});assert.equal(r.status,200);const flowId=r.body.purchaseRequests[0].id;
const flow=()=>JSON.parse(persisted()).purchaseRequests.find(p=>p.id===flowId);
const lineA=flow().items[0].id,lineB=flow().items[1].id;
assert.equal(purchaseQueue(flow(),'approval',stranger.userId),false);assert.equal(purchaseQueue(flow(),'approval',fixtureApprover.userId),true);
globalThis.__testUser=supplyUser;r=await send({action:'record-purchase',purchaseId:flowId,supplier:'Fornecedor fluxo',orderNumber:'PC-F1',items:[{purchaseItemId:lineA,qty:1,orderItem:'10'}]});assert.equal(r.status,400);
r=await approveOther(flowId);assert.equal(r.status,200);assert.equal(purchaseQueue(flow(),'procurement',supplyUser.userId),true);assert.equal(purchaseQueue(flow(),'receiving',warehouseUser.userId),false);
const po={action:'record-purchase',purchaseId:flowId,supplier:'Fornecedor fluxo',orderNumber:'PC-F1',expectedDate:'2026-11-20',items:[{purchaseItemId:lineA,qty:4,orderItem:'10'},{purchaseItemId:lineB,qty:5,orderItem:'20'}]};
for(const actor of [stranger,warehouseUser,fixtureApprover]){globalThis.__testUser=actor;r=await send(po);assert.equal(r.status,403);}
globalThis.__testUser=supplyUser;
for(const bad of [{supplier:''},{expectedDate:'2026-02-30'},{items:[{purchaseItemId:lineA,qty:11,orderItem:'10'}]},{items:[{purchaseItemId:lineA,qty:1,orderItem:'10'},{purchaseItemId:lineA,qty:1,orderItem:'20'}]},{items:[{purchaseItemId:lineA,qty:1,orderItem:'10'},{purchaseItemId:lineB,qty:1,orderItem:'10'}]},{items:[{purchaseItemId:lineA,qty:1,orderItem:'10'},{purchaseItemId:'missing',qty:1,orderItem:'20'}]}]){const before=persisted();r=await send({...po,...bad});assert.equal(r.status,400);assert.equal(persisted(),before);}
const stockBeforeOrder=JSON.parse(persisted()).materials;r=await send(po);assert.equal(r.status,200);assert.equal(flow().status,'Compra parcial');assert.deepEqual(JSON.parse(persisted()).materials,stockBeforeOrder);assert.equal(flow().receipts,undefined);assert.deepEqual(purchaseItemProgress(flow(),flow().items[0]),{requested:10,purchased:4,received:0,toPurchase:6,toReceive:10,inTransit:4});
let unchanged=persisted();r=await send(po);assert.equal(r.status,400);assert.equal(persisted(),unchanged);
r=await send({action:'cancel-purchase',purchaseId:flowId,note:'Não pode ocultar pendências'});assert.equal(r.status,400);assert.equal(persisted(),unchanged);
r=await send({action:'update-purchase',purchaseId:flowId,status:'Encerrada',note:'Manual'});assert.equal(r.status,400);
const orderA=flow().orders.find(o=>o.purchaseItemId===lineA).id,orderB=flow().orders.find(o=>o.purchaseItemId===lineB).id;
const receiveLine=(item,order,qty,extra={})=>{const i=flow().items.find(i=>i.id===item),o=flow().orders.find(o=>o.id===order);return {description:i.description,code:i.code,unit:i.unit,materialId:i.materialId,qty,price:1,orderItem:o.orderItem,purchaseId:flowId,purchaseItemId:item,orderLineId:order,...extra};};
const receipt={number:'FLOW-NF1',supplier:'Fornecedor fluxo',taxId:'567',series:'1',orderNumber:'PC-F1',project:itemForPurchase.project,items:[receiveLine(lineA,orderA,2),receiveLine(lineB,orderB,2)]};
for(const actor of [stranger,fixtureApprover,supplyUser]){globalThis.__testUser=actor;r=await send({action:'receive',invoice:receipt});assert.equal(r.status,403);}
globalThis.__testUser=warehouseUser;
for(const bad of [{orderNumber:'ERRADO'},{project:'Obra renomeada'},{items:[receiveLine(lineA,orderA,5)]},{items:[receiveLine(lineA,orderA,1,{unit:'UN'})]},{items:[receiveLine(lineA,orderA,1,{materialId:secondId})]},{items:[receiveLine(lineA,orderA,1,{orderItem:'99'})]},{items:[receiveLine(lineA,orderA,1,{orderLineId:'missing'})]},{items:[receiveLine(lineA,orderA,1,{purchaseItemId:'missing'})]},{items:[receiveLine(lineA,orderA,1,{purchaseId:selfId})]},{items:[receiveLine(lineA,orderA,3),receiveLine(lineA,orderA,2)]},{items:[receiveLine(lineB,orderB,1),receiveLine(lineA,orderA,20)]}]){const before=persisted();r=await send({action:'receive',invoice:{...receipt,...bad}});assert.equal(r.status,400);assert.equal(persisted(),before,'Invalid allocation must roll back balances, new materials and all receipt lines');}
unchanged=persisted();r=await post({action:'receive',version:v-1,invoice:receipt});assert.equal(r.status,400);assert.equal(persisted(),unchanged);
r=await send({action:'receive',invoice:receipt});assert.equal(r.status,200);assert.equal(flow().status,'Recebida parcialmente');assert.equal(flow().receipts.length,2);assert.equal(flow().items[0].qty,10);assert.ok(flow().receipts.every(x=>x.invoiceId===r.body.invoices[0].id));const valveId=flow().items[1].materialId;assert.ok(valveId);assert.equal(r.body.materials.find(m=>m.id===id).qty,stockBeforeOrder.find(m=>m.id===id).qty+2);assert.equal(r.body.materials.find(m=>m.id===valveId).qty,2);
assert.equal(purchaseQueue(flow(),'receiving',warehouseUser.userId),true);assert.equal(purchaseQueue(flow(),'procurement',supplyUser.userId),true);
unchanged=persisted();r=await send({action:'receive',invoice:receipt});assert.equal(r.status,400);assert.equal(persisted(),unchanged);
r=await send({action:'receive',invoice:{...receipt,number:'FLOW-UNLINKED',items:[{...receiveLine(lineA,orderA,1),purchaseId:'',purchaseItemId:'',orderLineId:''}]}});assert.equal(r.status,200);assert.equal(flow().receipts.length,2);assert.equal(purchaseItemProgress(flow(),flow().items[0]).received,2);
r=await send({action:'receive',invoice:{...receipt,number:'FLOW-NF2',items:[receiveLine(lineA,orderA,2),receiveLine(lineB,orderB,3)]}});assert.equal(r.status,200);assert.equal(flow().status,'Recebida parcialmente');assert.equal(purchaseQueue(flow(),'receiving','x'),false);assert.equal(purchaseQueue(flow(),'procurement','x'),true);assert.equal(r.body.materials.filter(m=>m.code==='VL-NOVA').length,1);assert.equal(r.body.materials.find(m=>m.id===valveId).qty,5);
globalThis.__testUser=supplyUser;r=await send({...po,orderNumber:'PC-F2',items:[{purchaseItemId:lineA,qty:6,orderItem:'10'}]});assert.equal(r.status,200);assert.equal(purchaseQueue(flow(),'procurement','x'),false);assert.equal(purchaseQueue(flow(),'receiving','x'),true);assert.equal(flow().status,'Recebida parcialmente');
const orderLast=flow().orders.find(o=>o.orderNumber==='PC-F2').id;
globalThis.__testUser=warehouseUser;r=await send({action:'receive',invoice:{...receipt,number:'FLOW-NF3',orderNumber:'PC-F2',items:[receiveLine(lineA,orderLast,5)]}});assert.equal(r.status,200);assert.equal(flow().status,'Recebida parcialmente');assert.equal(purchaseItemProgress(flow(),flow().items[0]).inTransit,1);
r=await send({action:'receive',invoice:{...receipt,number:'FLOW-NF4',orderNumber:'PC-F2',items:[receiveLine(lineA,orderLast,1)]}});assert.equal(r.status,200);assert.equal(flow().status,'Encerrada');assert.equal(flow().closedByReceiving,true);assert.equal(flow().closedBy,warehouseUser.displayName);assert.ok(flow().closedAt);assert.equal(purchaseQueue(flow(),'receiving','x'),false);assert.equal(purchaseQueue(flow(),'procurement','x'),false);
for(const i of flow().items){const p=purchaseItemProgress(flow(),i);assert.equal(p.requested,p.purchased);assert.equal(p.purchased,p.received);assert.equal(p.toPurchase,0);assert.equal(p.toReceive,0);}
unchanged=persisted();r=await send({action:'receive',invoice:{...receipt,number:'FLOW-NF5',orderNumber:'PC-F2',items:[receiveLine(lineA,orderLast,1)]}});assert.equal(r.status,400);assert.equal(persisted(),unchanged);
globalThis.__testUser=supplyUser;assert.equal((await download(flowId)).status,200);
const legacy={status:'Encerrada',approvedAt:'2025-01-01',approvedById:'legacy',items:[{id:'legacy-line',qty:2}]};const legacyData={purchaseRequests:[legacy]};globalThis.__testPurchases.refreshPurchaseFulfillment(legacyData,new Date().toISOString(),adminUser);assert.equal(legacy.receipts,undefined);assert.equal(legacy.closedByReceiving,undefined);
console.log('PASS: Suprimentos, aprovação por outra pessoa, filas por responsabilidade, compras e entregas parciais, vinculação NF/RC/item/pedido, saldo por pedido, limites, duplicidade, concorrência, atomicidade e encerramento exclusivo por entrada integral.');
