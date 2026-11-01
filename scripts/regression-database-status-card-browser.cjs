// Settings database card on the actual compiled app (prepared sources + web build), synthetic admin
// session, every API intercepted (no network). The card must not promise a later/automatic sync,
// because no resend exists: database down shows "Dados deste dispositivo continuam aqui;
// sincronização pendente." and the label "Sincronização pendente"; remote success shows the
// connected state; English follows the language choice; the admin migration chips are localized
// (PT "migração", EN through the static translator); 320 px without horizontal overflow.
// Screenshots go to artifacts/database-status.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm'),ts=require('typescript');
const {createRequire}=require('node:module');const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||__filename)('playwright');
assert.match(fs.readFileSync('client/src/pages/Home.tsx','utf8'),/account-active-reconciliation-fenced-v1/,'run after node scripts/v139/apply.mjs and a web build');
assert(fs.existsSync('dist/index.html')||fs.existsSync('dist/public/index.html'),'run after a web build');
const out=path.resolve('artifacts/database-status');fs.mkdirSync(out,{recursive:true});
const ast=ts.createSourceFile('server.mjs',fs.readFileSync('server.mjs','utf8'),99,true,ts.ScriptKind.JS),responder=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='serveStatic');
const scope=vm.createContext({guardStaticHtml:require('../server/static-html-guard.mjs').guardStaticHtml,fs,path,Buffer,distDir:path.resolve('dist'),sendJson:(res,code,body)=>{res.writeHead(code);res.end(JSON.stringify(body));}});vm.runInContext(responder.getText(ast)+'\nglobalThis.respond=serveStatic;',scope);const server=http.createServer((req,res)=>scope.respond(req,res,new URL(req.url,'http://localhost')));

const PROMISE=/(ser[áa]o?|será) sincronizad|sincroniza(ção|r) (ser[áa] )?retomad|quando (a conexão|o banco) voltar|sincronizará|fila de sincroniza|tentad[ao] novamente|will (be )?sync|automatic(ally)? (re)?(send|sync)|sync queue/i;
const scenarios={
 down:{language:'pt',health:{status:200,body:{ok:false,configured:true,connected:false}},db:{status:503,body:{ok:false,code:'DATABASE_OFFLINE'}},
  expect:{title:'Modo local protegido',message:'Banco indisponível. Dados deste dispositivo continuam aqui; sincronização pendente.',labels:['Histórico local ativo','Sincronização pendente','Verifique conexão e migração']}},
 downEnglish:{language:'en',health:{status:200,body:{ok:false,configured:true,connected:false}},db:{status:503,body:{ok:false,code:'DATABASE_OFFLINE'}},
  expect:{title:'Protected local mode',message:'Database unavailable. Data on this device stays here; sync is pending.',labels:['Local history active','Sync pending','Check connection and migration']}},
 connected:{language:'pt',health:{status:200,body:{ok:true,configured:true,connected:true,coreReady:true}},db:{status:200,body:{ok:true,database:'qa_sintetico'}},
  expect:{title:'Banco conectado',message:'Sincronização segura disponível para os módulos internos.',labels:['Aiven MySQL ativo','Sincronização liberada']}},
 // Admin chip while optional modules wait for a migration (no migration is run; the state is synthetic).
 migration:{language:'pt',health:{status:200,body:{ok:true,configured:true,connected:true,coreReady:true}},db:{status:200,body:{ok:true,database:'qa_sintetico',migrationRequired:true,missingOptionalCount:3}},
  expect:{title:'Banco conectado',message:'Sincronização segura disponível para os módulos internos.',labels:['Aiven MySQL ativo','3 módulo(s) aguardando migração']}},
 migrationEnglish:{language:'en',health:{status:200,body:{ok:true,configured:true,connected:true,coreReady:true}},db:{status:200,body:{ok:true,database:'qa_sintetico',migrationRequired:true,missingOptionalCount:3}},
  expect:{title:'Database connected',message:'Secure sync available for internal modules.',labels:['Aiven MySQL active','3 module(s) awaiting migration']}},
};
function seed({language}){
 localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'database-status-qa',name:'SYNTHETIC ADMIN QA',email:'qa-admin@example.test',role:'admin'}));localStorage.setItem('crewcheck_auth_token','synthetic-local-only');
 localStorage.setItem('crewcheck:first-access-tour:v1434:disabled','1');sessionStorage.setItem('crewcheck:first-access-tour:v1434:session-seen','1');localStorage.setItem('crewcheck_demo_mode_seen','1');
 localStorage.setItem('crewcheck_theme_mode','light');localStorage.setItem('crewcheck:appearance:v1','light');localStorage.setItem('crewcheck_language',language);
 window.Notification=class{static permission='denied';constructor(){throw Error('No real notification allowed')}};
}
const text=async locator=>(await locator.textContent()||'').replace(/\s+/g,' ').trim();
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});const results={};
 try{for(const [name,scenario] of Object.entries(scenarios)){
  const context=await browser.newContext({viewport:{width:320,height:900},locale:scenario.language==='en'?'en-US':'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
  const external=[];await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin){external.push(url.origin+url.pathname);return route.abort();}
   if(url.pathname==='/api/platform/database/health')return route.fulfill({status:scenario.health.status,contentType:'application/json',body:JSON.stringify(scenario.health.body)});
   if(url.pathname==='/api/db/status')return route.fulfill({status:scenario.db.status,contentType:'application/json',body:JSON.stringify(scenario.db.body)});
   if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,code:'SYNTHETIC_OFFLINE'})});return route.continue();});
  await context.addInitScript(seed,{language:scenario.language});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
  await page.goto(origin+'/app?view=settings');
  const card=page.locator('.cz-database-status');await card.waitFor();
  // Settled: the status call answered (button no longer busy) and the translator ran (next frame).
  await page.waitForFunction(()=>{const el=document.querySelector('.cz-database-status');return el&&!/Verificando|Checking/.test(el.querySelector('button')?.textContent||'')&&(el.querySelector('header p')?.textContent||'').trim().length>0;});
  await page.waitForTimeout(400);
  await card.scrollIntoViewIfNeeded();await card.screenshot({path:path.join(out,`database-status-${name}-320.png`)});
  const all=await text(card);
  assert.equal(await text(card.locator('h2')),scenario.expect.title,`${name}: title`);
  assert.equal(await text(card.locator('header p')),scenario.expect.message,`${name}: message`);
  for(const label of scenario.expect.labels)assert(all.includes(label),`${name}: label ${label} in "${all}"`);
  assert.doesNotMatch(all,PROMISE,`${name}: no promise of a later or automatic sync`);
  if(scenario.language==='pt')assert.doesNotMatch(all,/\bmigration\b/i,`${name}: Portuguese card without English words`);
  else assert.doesNotMatch(all,/migração|aguardando|módulo/i,`${name}: English card without Portuguese words`);
  const overflow=await page.evaluate(()=>{const el=document.querySelector('.cz-database-status');return{card:el.scrollWidth-el.clientWidth,page:document.documentElement.scrollWidth-window.innerWidth};});
  assert(overflow.card<=1&&overflow.page<=1,`${name}: no horizontal overflow at 320 px ${JSON.stringify(overflow)}`);
  assert.deepEqual(errors,[],`${name}: no page errors`);assert(external.every(url=>/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)),`${name}: only web fonts were attempted, and aborted: ${external}`);
  results[name]=all;await context.close();
 }}finally{await browser.close();server.close();}
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,1));
 console.log('PASS database status card (compiled app, synthetic admin, APIs intercepted): database down shows the honest copy and "Sincronização pendente" with no promised sync; English follows the language; remote success shows the connected state; admin migration chips say "migração" ("3 módulo(s) aguardando migração" / "3 module(s) awaiting migration") with no language mix; 320 px without overflow; screenshots in artifacts/database-status.');
})().catch(error=>{console.error(error);process.exit(1);});
