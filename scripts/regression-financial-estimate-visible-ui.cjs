const { createRequire } = require('node:module');
const { chromium } = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || __filename)('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const out = path.resolve(process.env.FINANCIAL_UI_EVIDENCE_DIR || 'artifacts/financial-estimate-visible');
fs.mkdirSync(out, { recursive: true });
const dist = path.resolve('dist');
// Exercise the production static responder rather than a test-only MIME table.
const vm = require('node:vm'), ts = require('typescript');
const serverSource=fs.readFileSync(path.resolve('server.mjs'),'utf8');
const staticAst=ts.createSourceFile('server.mjs',serverSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const staticFunctions=staticAst.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='serveStatic');
assert.equal(staticFunctions.length,1,'exactly one production static handler must exist');
const staticContext=vm.createContext({fs,path,Buffer,distDir:dist,sendJson:(res,status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));}});
vm.runInContext(staticFunctions[0].getText(staticAst)+'\nglobalThis.respond=serveStatic;',staticContext);
let handler; const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');if(handler&&await handler(req,res,url))return;staticContext.respond(req,res,url);});
function syntheticPDF(name, codes, partial = false) {
    const lines = ['SYNTHETIC QA ROSTER', 'Roster Report Date 01-Feb-2032 to 29-Feb-2032', 'TESTE SINTETICO | 900001 | CCM | BSB | CCM'];
    for (let day = 1; day <= 29; day++) {
        if (partial && day !== 10)
            continue;
        if (day === 2) {
            lines.push('02-Feb-2032 VOO');
            codes.forEach((code, i) => lines.push(`${code} BSB ${String(8 + i * 3).padStart(2, '0')}:00 GRU ${String(9 + i * 3).padStart(2, '0')}:00 OP`));
        }
        else if(day===1) lines.push('01-Feb-2032 CRM 07:00 19:00 BSB');
        else
            lines.push(`${String(day).padStart(2, '0')}-Feb-2032 DO`);
    }
    const content = lines.map((line, i) => `BT /F1 10 Tf 35 ${800 - i * 19} Td (${line}) Tj ET`).join('\n');
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((o, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const start = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('') + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
    fs.writeFileSync(path.join(out, name + '.pdf'), pdf);
}

syntheticPDF('synthetic-operational-only',['LA9001']);
(async()=>{
 const phase=process.argv[2]||'after';await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
 try{const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});let writes=0;
 await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();if(u.pathname.startsWith('/api/')){if(u.pathname.startsWith('/api/platform/finance/')&&r.request().method()!=='GET')writes++;return r.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"items":[],"data":[]}'});}return r.continue();});
 await context.addInitScript(()=>{const NativeDate=Date,instant=Date.parse('2032-02-02T15:00:00Z');globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}};localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'financial-ui-qa',email:'synthetic@example.invalid',name:'TESTE SINTETICO',role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-only');localStorage.setItem('crewcheck:first-access-tour:v1434:disabled','1');localStorage.setItem('crewcheck_demo_mode_seen','1');sessionStorage.setItem('crewcheck_initial_view','import');localStorage.setItem('crewcheck_financial_settings_v1:financial-ui-qa:crewcheck_perdiem_rate_domestic','100');localStorage.setItem('crewcheck_financial_settings_v1:financial-ui-qa:crewcheck_salary_base_brl','2400');});
 const page=await context.newPage();page.setDefaultTimeout(15000);await page.goto(origin+'/app');await page.locator('.cz-app').waitFor();await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'import'})));
 await page.locator('input[accept="application/pdf,.pdf"]').setInputFiles(path.join(out,'synthetic-operational-only.pdf'));
 await page.getByRole('button',{name:'Ativar escala',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.cc-import-confirm-overlay'));await page.waitForFunction(()=>{try{return JSON.parse(sessionStorage.getItem('crewcheck_roster')).roster.days.length>0;}catch{return false;}});
 await page.waitForFunction(()=>document.querySelector('input[accept="application/pdf,.pdf"]')?.value==='');await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'perdiem'})));await page.locator('.cc-payment-hero').waitFor().catch(async e=>{console.log(await page.locator('body').innerText());throw e;});
 const allowance=await (await page.waitForFunction(phase=>{const text=document.querySelector('.cc-payment-hero')?.innerText||'';return /2 itens/.test(text)&&(phase==='before'||/R\$/.test(text))?text:false;},phase)).jsonValue();console.log('synthetic allowance',allowance);
 if(phase==='before')assert(!/R\$\s*\d/.test(allowance),'baseline hides known subtotal');else{assert.match(allowance,/R\$\s*\d/);assert.match(allowance,/subtotal estimado/);assert.match(allowance,/Data a confirmar/);assert.equal(await page.locator('.cc-payment-value small').evaluate(el=>getComputedStyle(el).color),'rgb(213, 228, 238)','partial label stays readable on dark card');}
 await page.screenshot({path:path.join(out,phase+'-allowance.png'),fullPage:true});
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'salary'})));await page.getByRole('heading',{name:'Salário',exact:true}).waitFor();
 const salary=await (await page.waitForFunction(phase=>{const text=document.querySelector('.cc-payment-hero')?.innerText||'';return phase==='before'?(text.includes('Folha · bruto estimado')?text:false):(text.includes('Estimativa salarial da escala')&&/R\$/.test(text)?text:false);},phase)).jsonValue();console.log('synthetic salary',salary);
 if(phase==='before')assert(!/R\$\s*\d/.test(salary),'baseline hides operational salary without credit cycle');else{assert.match(salary,/Estimativa salarial da escala/);assert.match(salary,/R\$\s*\d/);assert.match(salary,/Mês de crédito a confirmar/);assert.match(salary,/antes dos descontos/);assert(!/recebido|líquido confirmado/i.test(salary));}
 await page.screenshot({path:path.join(out,phase+'-salary.png'),fullPage:true});assert.equal(writes,0,'ledger OFF never writes or backfills');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 fs.writeFileSync(path.join(out,phase+'-result.json'),JSON.stringify({phase,realPdfImport:true,ledgerOff:true,writes,allowance,salary},null,2));console.log('PASS '+phase+' real PDF import -> mobile estimates independent of ledger/payment confirmation');await context.close();
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
