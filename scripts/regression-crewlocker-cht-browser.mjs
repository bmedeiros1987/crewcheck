import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
const {chromium}=createRequire(process.env.CREWLOCKER_TEST_PACKAGE || import.meta.url)('playwright');
const state=process.env.CREWLOCKER_STATE || 'raw';
const out=path.resolve('artifacts/crewlocker-cht');fs.mkdirSync(out,{recursive:true});
const html=`<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;font-family:system-ui,sans-serif"><div id="root"></div><script type="module">
import React from 'react';
import {Toaster} from 'sonner';
import {createRoot} from 'react-dom/client';
import CrewLockerView from '/src/components/v1435/CrewLockerView.tsx';
import '/src/components/v1435/crewlocker.css';
createRoot(document.getElementById('root')).render(React.createElement(React.Fragment,null,React.createElement(CrewLockerView),React.createElement(Toaster)));</script></body></html>`;
const server=await createServer({configFile:false,root:path.resolve('client'),resolve:{alias:{'@':path.resolve('client/src')}},esbuild:{jsx:'automatic'},optimizeDeps:{entries:[]},plugins:[{name:'synthetic-locker',configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url==='/__locker'){res.setHeader('content-type','text/html');void server.transformIndexHtml('/__locker',html).then(result=>res.end(result));}else next();});}}],server:{host:'127.0.0.1',port:0,fs:{allow:[process.cwd(),fs.realpathSync('node_modules')]}}});await server.listen();
const origin='http://127.0.0.1:'+server.httpServer.address().port;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}: {})});
// Sanitized semantic fixture shared with regression-crewlocker-cht-text.mjs.
// A minimal native-text PDF: no PDF generator package, scanned image or real document.
function fixturePdf(issue='03/02/2030') {
 const text="CERTIFICADO DE HABILITAÇÃO TÉCNICA – CHT\nII - LICENÇA / LICENSE\nLicença | Categoria | Data de Expedição\nLicense | Category | Date of Issue (dd/mm/yyyy)\nCOMISSÁRIO | Comissário(a) de Vôo | 12/02/2020\nFLIGHT ATTENDANT | Flight Attendant\n--- PÁGINA 2 ---\nXII - HABILITAÇÕES / RATINGS\nTipo | Validade | Função a bordo\nType Rating | Date of Expiry (mm/yyyy) | Onboard Duty\nA320 | 08/2031 | Comissário(a) de Vôo / Flight Attendant\nXIV - CERTIFICADO MÉDICO AERONÁUTICO / MEDICAL CERTIFICATE\nClasse | Validade | Órgão Expedidor | Tipo Sanguíneo\nLicense | Date of Expiry (dd/mm/yyyy) | Issuing Agency | Blood Group\nSegunda / | 17/05/2033 | [OMITIDO] | [OMITIDO]\nSecond\nObservações CMS - 2ª CLASSE - COMISSÁRIO DE VOO / CLASS 2 - CABIN CREW.\nRemarks POSSUI CMA DE 1ª CLASSE -\nPLA VÁLIDO ATÉ 17/05/2030 EMITIDO PELA [ÓRGÃO FICTÍCIO] /\nFIRST CLASS VALID UNTIL 05/17/2030.\nXIII - OBSERVAÇÕES / REMARKS\nENGLISH LEVEL 4 UNTIL 11/2031\nPORTUGUESE LEVEL 6\nDATA DE EMISSÃO\nDATE OF ISSUE (dd/mm/yyyy)\n03/02/2030\nX - ASSINATURA DO EMISSOR / SIGNATURE OF AUTHORITY\nEmitida eletronicamente em 03/02/2030, às 10:15, conforme horário oficial de Brasília.\n";
 const pages=text.replaceAll('03/02/2030',issue).split('--- PÁGINA 2 ---').map(page=>page.trim().split('\n'));
 const escape=value=>value.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
 const stream=lines=>'BT /F1 10 Tf 30 750 Td 28 TL '+lines.map((line,i)=>(i?'T* ':'')+'('+escape(line)+') Tj').join('\n')+' ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>'];
 for(const [index,lines] of pages.entries()){const content=stream(lines);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents ${index?6:4} 0 R >>`,`<< /Length ${Buffer.byteLength(content,'latin1')} >>\nstream\n${content}\nendstream`);}
 objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
 let result='%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';const offsets=[0];
 objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(result,'latin1'));result+=`${index+1} 0 obj\n${object}\nendobj\n`;});
 const xref=Buffer.byteLength(result,'latin1');result+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(result.replaceAll('–','\x96'),'latin1');
}
const original=fixturePdf(),renewedIssue=fixturePdf('20/09/2031');
fs.writeFileSync(path.join(out,'synthetic-cht.pdf'),original);
const results=[];
async function assertEntries(page){
 const list=page.locator('.cc-validity-list');await list.getByText('A320',{exact:true}).waitFor();assert.equal(await list.locator('li').count(),4);
 for(const [label,date] of [['A320','08/2031'],['CMA classe 2','17/05/2033'],['CMA classe 1','17/05/2030'],['Inglês nível 4','11/2031']])assert.match(await list.locator('li').filter({has:page.getByText(label,{exact:true})}).innerText(),new RegExp(date));
 const text=await list.innerText();assert.doesNotMatch(text,/Portugu[eê]s|PORTUGUESE|03\/02\/2030|20\/09\/2031/);assert.match(text,/Fonte: pendente/);assert.match(text,/Aptidão não avaliada/);
}
async function renderedCanvas(page,label){
 const canvas=page.getByLabel(label,{exact:true});await canvas.waitFor();
 await page.waitForFunction(label=>{const c=document.querySelector('canvas[aria-label="'+label+'"]');if(!c?.width||!c.height)return false;const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]&&pixels[i]<180&&pixels[i+1]<180&&pixels[i+2]<180)ink++;return ink>100;},label);
 return createHash('sha256').update(await canvas.evaluate(c=>c.toDataURL())).digest('hex');
}
try{
for(const width of [390,1440]){
 const context=await browser.newContext({viewport:{width,height:900},timezoneId:'America/Sao_Paulo',serviceWorkers:'block',acceptDownloads:true});const errors=[],external=[];
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();external.push(route.request().url());return route.abort();});
 await context.addInitScript(()=>{if(!localStorage.getItem('crewcheck_auth_user')){localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-cht-a',role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-cht-token');}window.__permissionCalls=0;window.Notification=class{static permission='default';static requestPermission(){window.__permissionCalls++;throw Error('Unexpected permission prompt');}};});
 const page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});await page.goto(origin+'/__locker');
 await page.getByLabel('PIN do cofre desta conta').fill('918273');await page.getByRole('button',{name:'Criar PIN desta conta'}).click();await page.getByRole('heading',{name:'Guardar cópia offline'}).waitFor();
 await page.getByLabel('Nome do titular').fill('SYNTHETIC ONLY');await page.getByLabel('Nome no cartão').fill('SYNTHETIC CHT');
 await page.getByLabel('Arquivo').setInputFiles({name:'synthetic-cht.pdf',mimeType:'application/pdf',buffer:original});await page.getByText('4 validades lidas',{exact:true}).waitFor({timeout:30000}).catch(async error=>{console.error('Upload DOM:',await page.locator('body').innerText());throw error;});console.log('PASS upload native PDF4validities',width);
 await page.getByText('4 validades · conferir ou ajustar',{exact:true}).click();await page.getByRole('button',{name:'Ajustar validades',exact:true}).click();
 const review=page.getByRole('region',{name:'Revisão de validades'});await review.waitFor();assert.equal(await page.getByRole('button',{name:'Criptografar e guardar offline'}).isDisabled(),true,'import waits for open validity editor');
 for(const month of ['2031-09','2031-08']){await review.getByRole('button',{name:'Alterar A320',exact:true}).click();assert.equal(await review.getByLabel('Nome / tipo / classe').inputValue(),'A320');assert.equal(await review.getByLabel('Precisão da validade').inputValue(),'month');await review.getByLabel('Mês e ano (sem inventar dia)').fill(month);await review.getByRole('button',{name:'Aplicar ajuste',exact:true}).click();}
 await review.getByRole('button',{name:'Salvar revisão',exact:true}).click();await review.waitFor({state:'detached'});console.log('PASS prefilled validity edit/restore/import guard',width);

 await page.getByRole('button',{name:'Criptografar e guardar offline'}).click();await assertEntries(page);assert.equal(await page.locator('.cc-locker-list > article').count(),1);console.log('PASS encrypted save4validities',width);
 await page.reload();await page.getByLabel('PIN do cofre desta conta').fill('918273');await page.getByRole('button',{name:'Desbloquear',exact:true}).click();await assertEntries(page);
 await page.getByLabel('Nome do titular').fill('SYNTHETIC ONLY');
 await page.getByLabel('Arquivo').setInputFiles({name:'synthetic-new-issue.pdf',mimeType:'application/pdf',buffer:renewedIssue});await page.getByText('4 validades lidas',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Criptografar e guardar offline'}).click();
 await page.getByRole('status').filter({hasText:'Mesmas validades já guardadas.'}).waitFor();assert.equal(await page.getByRole('button',{name:'Guardar outra cópia',exact:true}).count(),1,'alternate copy requires explicit action');
 await assertEntries(page);assert.equal(await page.locator('.cc-locker-list > article').count(),1,'different issuance does not create another file or validity');console.log('PASS reload and issuance dedup',width);
 await page.getByRole('button',{name:'Abrir documento'}).click();const preview=page.getByRole('region',{name:'Prévia local do documento'});await preview.waitFor();const first=await renderedCanvas(page,'Página 1');await preview.getByRole('button',{name:'Próxima',exact:true}).click();const second=await renderedCanvas(page,'Página 2');assert.notEqual(first,second,'both real PDF pages render distinct text');assert.equal(await preview.getByRole('button',{name:'Próxima',exact:true}).isDisabled(),true);await page.screenshot({path:path.join(out,`preview-${width}.png`),fullPage:true});await preview.getByRole('button',{name:'Fechar prévia'}).click();
 const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Baixar documento'}).click();const download=await downloadEvent;assert.equal(download.suggestedFilename(),'synthetic-cht.pdf');assert.deepEqual(fs.readFileSync(await download.path()),original,'existing original encrypted file remains downloadable after duplicate import');
 await page.getByRole('button',{name:'Abrir documento'}).click();await renderedCanvas(page,'Página 1');await page.evaluate(()=>{localStorage.removeItem('crewcheck_auth_token');window.dispatchEvent(new CustomEvent('crewcheck:auth-expired'));});await page.getByRole('heading',{name:'Desbloquear cofre local'}).waitFor();assert.equal(await page.locator('.cc-validity-list').count(),0);assert.equal(await page.locator('canvas').count(),0);
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-cht-b',role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-cht-token-b');window.dispatchEvent(new CustomEvent('crewcheck:auth-changed'));});await page.getByLabel('PIN do cofre desta conta').fill('918273');await page.getByRole('button',{name:'Criar PIN desta conta'}).click();await page.getByText('Nenhum documento salvo neste aparelho.').waitFor();assert.equal(await page.locator('.cc-validity-list li').count(),0);assert.equal(await page.getByRole('button',{name:'Baixar documento'}).count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(await page.evaluate(()=>window.__permissionCalls),0);results.push({width,nativeTextPages:2,validities:4,reimportDocuments:1,downloadOriginal:true,logoutIsolation:true,externalRequests:0});await context.close();
}
fs.writeFileSync(path.join(out,`cht-${state}.json`),JSON.stringify({synthetic:true,actualCrewLocker:true,results},null,2));console.log('PASS actual CrewLocker native PDF: four validades, issuance dedup/reload, two canvas pages, original download, logout/account isolation, no external requests');
}finally{await browser.close();await server.close();}
