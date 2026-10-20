import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { jsPDF } from 'jspdf';
import { loadClientModules } from './lib/ts-module-harness.mjs';
const require = createRequire(import.meta.url);
const values = new Map();
let dispose = () => {};
const previous = {localStorage:globalThis.localStorage,window:globalThis.window};
globalThis.localStorage = {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
globalThis.window = new EventTarget();
const login=(id,token='synthetic-'+id,role='user')=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id,role}));localStorage.setItem('crewcheck_auth_token',token);};
const modules=loadClientModules({files:['client/src/lib/financialStatementLearning.ts','client/src/lib/financialPdfText.ts']});
try {
 const learning=modules.load('financialStatementLearning');
 const pdfText=modules.load('financialPdfText');
 const source=fs.readFileSync('client/src/components/finance/FinancialStatementImporter.tsx','utf8');
 const ast=ts.createSourceFile('FinancialStatementImporter.tsx',source,99,true,ts.ScriptKind.TSX);
 const names=['extractPdfPages','extractPdfText','formatMoney','FinancialStatementImporter'];
 const functions=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.includes(node.name?.text));assert.equal(functions.length,4,'exact production PDF extractor, rendered component and handlers');
 const compiled=ts.transpileModule(functions.map(node=>node.getText(ast)).join('\n')+'\nglobalThis.subject={extractPdfPages,extractPdfText,FinancialStatementImporter};',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const header=['DEMONSTRATIVO DE DIARIAS','De 2032-10-01 até 2032-10-07','Pagamento em 2032-10-09','TAXI R$ 31,50','CAFE R$ 25,00'];
 const pdfFile=(lines,name='synthetic-taxi.pdf',repeat=true)=>{const pdf=new jsPDF();const write=()=>lines.forEach((line,i)=>pdf.text(line,15,15+i*12));write();if(repeat){pdf.addPage();write();}return new File([pdf.output('arraybuffer')],name,{type:'application/pdf'});};
 const walk=(node,predicate)=>{if(!node||typeof node!=='object')return [];const children=node.props?.children;return [...(predicate(node)?[node]:[]),...(Array.isArray(children)?children:[children]).flatMap(child=>walk(child,predicate))];};
 const labelText=node=>typeof node==='string'?node:Array.isArray(node)?node.map(labelText).join(''):labelText(node?.props?.children??'');
 function harness(helperOverrides={}){
  dispose(); // Unmount the previous fixture, including its real auth listeners.
  const states=[],refs=[];let stateIndex=0,refIndex=0,mounted=false;const effects=[],cleanups=[];
  dispose=()=>{for(const cleanup of cleanups)cleanup();cleanups.length=0;};
  const exports={};const context=vm.createContext({...learning,...pdfText,...helperOverrides,require,exports,module:{exports},Uint8Array,File,Event,CustomEvent,window,
   pdfWorkerUrl:pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs')).href,
   useState:initial=>{const index=stateIndex++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];},
   useRef:initial=>{const index=refIndex++;return refs[index]??(refs[index]={current:initial});},useMemo:fn=>fn(),useEffect:fn=>{if(!mounted)effects.push(fn);},
   // This handler fixture renders the visible privacy mode. The compiled-app
   // privacy regression separately verifies the actual hook and hidden DOM.
   useFinancialPrivacy:()=>({amount:value=>value,text:value=>value}),FinancialPrivacyToggle:()=>null,
   // Independent owner-review form is exercised by regression-owner-per-diem-browser.
   OwnerPerDiemConfirmation:()=>null,
   Check:()=>null,FileSearch:()=>null,History:()=>null,ShieldCheck:()=>null,Upload:()=>null,X:()=>null});
  vm.runInContext(compiled,context);
  let tree;
  const render=()=>{stateIndex=0;refIndex=0;tree=context.subject.FinancialStatementImporter({mode:'per_diem'});if(!mounted){mounted=true;for(const effect of effects){const cleanup=effect();if(typeof cleanup==='function')cleanups.push(cleanup);}}return tree;};
  const button=()=>walk(tree,node=>node.type==='button'&&labelText(node.props.children)==='Confirmar valores')[0];
  const importFile=async file=>{const input=walk(tree,node=>node.type==='input'&&node.props.type==='file')[0];await input.props.onChange({target:{files:[file]}});render();};
  const checkSource=()=>{const checkbox=walk(tree,node=>node.type==='input'&&node.props.type==='checkbox')[0];assert.ok(checkbox);checkbox.props.onChange({target:{checked:true}});render();};
  render();return {render,button,importFile,checkSource,extract:context.subject.extractPdfText,extractPages:context.subject.extractPdfPages,getTree:()=>tree};
 }
 login('positive');const positive=harness();
 const file=pdfFile([...header,'Adiantamento de despesas de viagem em 2032-10-02 R$ 100,00','Total depositado na data 2032-10-02 R$ 100,00','Total depositado na data 2032-10-09 R$ 56,50']);
 const pages=await positive.extractPages(file);
 assert.equal(pages.length,2,'actual PDF extractor retains both pages');
 assert.deepEqual(pages.map(page=>[page.page,page.origin]),[[1,'pdf-physical'],[2,'pdf-physical']]);
 assert.ok(pages.every(page=>page.text.includes('\nTAXI R$ 31,50\n')),'actual geometry helper retains separate rubric lines');
 const text=await positive.extract(file);assert.equal(text,pdfText.financialPdfPagesText(pages),'actual text wrapper uses coherent paginated source');const learned=learning.learnFinancialStatement(text,file.name);
 assert.equal(learned.totals.deposited,56.5);assert.deepEqual(learned.warnings,[]);assert.equal(learned.rates.length,2);assert.equal(learned.rates.every(rate=>!rate.confirmed),true);
 await positive.importFile(file);assert.equal(positive.button().props.disabled,true,'owner must explicitly review source before UI confirmation');positive.button().props.onClick();assert.equal(learning.readConfirmedFinancialRates().length,0);
 positive.checkSource();assert.equal(positive.button().props.disabled,false);positive.button().props.onClick();positive.render();assert.equal(positive.button(),undefined,'successful real confirm handler closes review');
 assert.equal(learning.readConfirmedFinancialRates().length,2);assert.equal(learning.confirmedRateValueAt('per_diem.taxi','2032-10-01'),31.5);assert.equal(learning.confirmedRateValueAt('per_diem.breakfast','2032-10-07'),25);assert.equal(learning.confirmedRateValueAt('per_diem.taxi','2032-09-30'),null);assert.equal(learning.confirmedRateValueAt('per_diem.taxi','2032-10-08'),null);
 // Counterproof: the real importer must consume the real adapter output; dropping it prevents confirmation.
 login('mutated-adapter');const broken=harness({financialPdfPagesText:()=>''});
 await broken.importFile(file);assert.equal(broken.button(),undefined,'corrupt adapter must not expose confirmation');
 assert.ok(walk(broken.getTree(),node=>node.props?.role==='alert').length,'corrupt adapter is reported, not silently accepted');
 assert.equal(learning.readConfirmedFinancialRates().length,0,'mutated real caller cannot save a tariff');
 login('other');assert.equal(learning.confirmedRateValueAt('per_diem.taxi','2032-10-05'),null,'rates never leak between owners');
 for(const [id,lines,name] of [
  ['reported-malformed-cafe', [...header.map(line=>line.startsWith('CAFE ')?'CAFE R$ 1.2,34':line),'Total depositado na data 2032-10-09 R$ 56,50'],'synthetic-reported-money.pdf'],
  ['reported-invalid-payment', [...header.map(line=>line.startsWith('Pagamento em ')?'Pagamento em 2026-02-31':line),'Total depositado R$ 56,50'],'synthetic-reported-date.pdf'],
  ['invalid-calendar-period', [...header.map(line=>line.startsWith('De ')?'De 2026-02-31 até 2026-03-04':line),'Total depositado na data 2032-10-09 R$ 56,50'],'synthetic-calendar-period.pdf'],
  ['invalid-rate-0', [...header.map(line=>line.startsWith('TAXI ')?'TAXI R$ 31,501':line),'Total depositado na data 2032-10-09 R$ 56,50'],'synthetic-invalid-rate-0.pdf'],
  ['invalid-rate-1', [...header.map(line=>line.startsWith('TAXI ')?'TAXI R$ 1.2.3,45':line),'Total depositado na data 2032-10-09 R$ 56,50'],'synthetic-invalid-rate-1.pdf'],
  ['invalid-rate-2', [...header.map(line=>line.startsWith('TAXI ')?'TAXI R$ 31,50x':line),'Total depositado na data 2032-10-09 R$ 56,50'],'synthetic-invalid-rate-2.pdf'],
  ['invalid-rate-3', [...header.map(line=>line.startsWith('TAXI ')?'TAXI R$ -31,50':line),'Total depositado na data 2032-10-09 R$ 56,50'],'synthetic-invalid-rate-3.pdf'],
  ['invalid-rate-4', [...header.map(line=>line.startsWith('TAXI ')?'TAXI R$ 31,5':line),'Total depositado na data 2032-10-09 R$ 56,50'],'synthetic-invalid-rate-4.pdf'],
  ['invalid-rate-5', [...header.map(line=>line.startsWith('TAXI ')?'TAXI R$ 900719925474099,99':line),'Total depositado na data 2032-10-09 R$ 56,50'],'synthetic-invalid-rate-5.pdf'],
  ['conflicting', [...header,'Total depositado na data 2032-10-09 R$ 56,50','Total depositado na data 2032-10-09 R$ 57,50'],'synthetic-conflict.pdf'],
  ['ambiguous-payment', [...header,'Pagamento em 2032-10-10','Total depositado na data 2032-10-09 R$ 56,50'],'synthetic-payment-conflict.pdf'],
  ['ambiguous-payment-reversed', ['Pagamento em 2032-10-10',...header,'Total depositado na data 2032-10-09 R$ 56,50'],'synthetic-payment-conflict-order.pdf'],
  ['malformed', [...header,'Total depositado na data 2032-10-09 R$ 56,501'],'synthetic-malformed.pdf'],
  ['invalid-period', [...header.map(line=>line.startsWith('De ')?'De 2032-10-31 até 2032-10-07':line),'Total depositado na data 2032-10-09 R$ 56,50'],'synthetic-period.pdf'],
 ]) {login(id);const app=harness();await app.importFile(pdfFile(lines,name));app.checkSource();assert.equal(app.button().props.disabled,true,id);app.button().props.onClick();assert.equal(learning.readConfirmedFinancialRates().length,0,id+' direct handler cannot bypass mandatory review');}
 login('missing-provenance');const missing=harness();await missing.importFile(pdfFile([...header,'Total depositado na data 2032-10-09 R$ 56,50'],''));missing.checkSource();missing.button().props.onClick();missing.render();assert.equal(learning.readConfirmedFinancialRates().length,0,'missing document provenance cannot save');assert.ok(walk(missing.getTree(),node=>node.props?.role==='alert').length);
 login('stale-A');const stale=harness();await stale.importFile(file);stale.checkSource();const staleClick=stale.button().props.onClick;login('stale-B');staleClick();assert.equal(learning.readConfirmedFinancialRates().length,0,'old owner handler cannot save new account');login('stale-A');assert.equal(learning.readConfirmedFinancialRates().length,0);
 login('rotated','synthetic-token-1');const rotated=harness();await rotated.importFile(file);rotated.checkSource();const rotatedClick=rotated.button().props.onClick;login('rotated','synthetic-token-2');rotatedClick();assert.equal(learning.readConfirmedFinancialRates().length,0,'same-owner stale token cannot save');
 login('guest','synthetic-guest','visitor');const visitor=harness();assert.equal(walk(visitor.getTree(),node=>node.type==='input'&&node.props.type==='file').length,0);assert.equal(learning.readConfirmedFinancialRates().length,0);
 console.log('PASS synthetic real PDF.js extractor -> reader -> actual importer render/confirm -> owner-bounded tariff: dated/repeated/current-vs-historical total; source review, invalid money/period/provenance, owner/token/visitor guards; no payment confirmation or real data.');
}finally{dispose();modules.cleanup();globalThis.localStorage=previous.localStorage;globalThis.window=previous.window;}
