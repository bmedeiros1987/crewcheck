import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import ts from 'typescript';
const require=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url);
const {chromium}=require('playwright');
// Run the real App/Router/Protected, real preference/auth modules and global
// notice. Heavy route contents are markers. Home's preference effect, if any,
// is extracted from the production AST rather than initialized by the fixture.
const home=fs.readFileSync('client/src/pages/Home.tsx','utf8');
const ast=ts.createSourceFile('Home.tsx',home,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const effects=[];
function visit(node){if(ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&node.expression.expression.getText(ast)==='useEffect'&&node.expression.arguments[0]?.getText(ast)==='initializeCrewTextSize')effects.push(node.getText(ast));ts.forEachChild(node,visit);}visit(ast);
const homeStub=`import React,{useEffect}from'react';import{initializeCrewTextSize}from'${path.resolve('client/src/lib/textSizePreference.ts')}';export default function Home(){${effects.join('\n')}return <div data-route="Home">Home</div>;}`;
const result=await build({stdin:{contents:`import React,{StrictMode}from'react';import{createRoot}from'react-dom/client';import{useLocation}from'wouter';import App from'./client/src/App';import{saveCrewTextSize}from'./client/src/lib/textSizePreference';import'./client/src/styles/compact-navigation.css';window.fixtureSave=saveCrewTextSize;function Harness(){const[,navigate]=useLocation();window.fixtureNavigate=navigate;return <App/>;}const root=createRoot(document.getElementById('root'));window.fixtureUnmount=()=>root.unmount();root.render(<StrictMode><Harness/></StrictMode>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'fixture.js',jsx:'automatic',alias:{'@':path.resolve('client/src'),'@shared':path.resolve('shared')},plugins:[{name:'bounded-route-contents',setup(plugin){
 plugin.onResolve({filter:/^\.\/pages\//},args=>args.importer.endsWith('/App.tsx')?{path:args.path,namespace:'route-fixture'}:undefined);
 plugin.onLoad({filter:/.*/,namespace:'route-fixture'},args=>({contents:args.path.endsWith('/Home')?homeStub:`import React from'react';export default function Page(){return <div data-route=${JSON.stringify(args.path.split('/').pop())}>Route fixture</div>;}`,loader:'tsx',resolveDir:process.cwd()}));
 plugin.onResolve({filter:/^\.\/components\//},args=>args.importer.endsWith('/App.tsx')&&!args.path.endsWith('/PwaInstallNotice')?{path:args.path,namespace:'app-support-fixture'}:undefined);
 plugin.onLoad({filter:/.*/,namespace:'app-support-fixture'},()=>({contents:"import React from'react';export const useStartupCopy=()=>({opening:'Opening'});export const StartupProgress=()=>null;export default function Support({children}){return children||null;}",loader:'tsx'}));
 plugin.onResolve({filter:/^\.\/lib\/(i18n|pwaUpdateCoordinator)$/},args=>args.importer.endsWith('/App.tsx')?{path:args.path,namespace:'global-support-fixture'}:undefined);
 plugin.onLoad({filter:/.*/,namespace:'global-support-fixture'},()=>({contents:'export const applyDocumentLanguage=()=>{};export const installGlobalStaticTranslations=()=>{};export const installPwaUpdateCoordinator=()=>()=>{};',loader:'js'}));
}}]});
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text,css=result.outputFiles.find(f=>f.path.endsWith('.css')).text;
let requests=0;
const server=http.createServer((req,res)=>{requests++;res.setHeader('cache-control','no-store');if(req.url==='/fixture.js'){res.setHeader('content-type','text/javascript');res.end(js);}else if(req.url?.startsWith('/api/')){res.setHeader('content-type','application/json');const owner=req.headers.authorization?.includes('synthetic_b')?'synthetic_b':'synthetic_a';res.end(JSON.stringify(req.url.startsWith('/api/auth/me')?{ok:true,user:{id:owner,name:'Synthetic',email:owner+'@example.invalid'}}:{}));}else{res.setHeader('content-type','text/html');res.end(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/fixture.js"></script>`);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
let browser,checks=0;const failures=[],measurements=[];
function check(value,label){checks++;if(!value)failures.push(label);}
const notice=page=>page.getByRole('complementary',{name:'Instalar CrewCheck'});
async function measured(page,label,size){await notice(page).waitFor();const row=await notice(page).evaluate(node=>({attribute:document.documentElement.dataset.crewTextSize||null,scale:document.documentElement.style.getPropertyValue('--cc-text-scale'),body:parseFloat(getComputedStyle(node).fontSize),title:parseFloat(getComputedStyle(node.querySelector('strong')).fontSize),action:parseFloat(getComputedStyle(node.querySelector('button')).fontSize)}));measurements.push({label,size,...row});check(row.attribute===String(size)&&Math.abs(Number(row.scale)-size/100)<.001,label+' document preference');check(Math.abs(row.body-14*size/100)<.1&&Math.abs(row.title-15*size/100)<.1&&Math.abs(row.action-14*size/100)<.1,label+' global notice/body/title/action');}
try{
 browser=await chromium.launch({args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 for(const size of [150,200]){
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await context.addInitScript(size=>{Object.defineProperty(navigator,'userAgent',{get:()=> 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 Version/18.4 Mobile Safari/604.1'});Object.defineProperty(navigator,'platform',{get:()=> 'iPhone'});if(!localStorage.getItem('fixture-seeded')){localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic_a',name:'Synthetic',email:'synthetic_a@example.invalid'}));localStorage.setItem('crewcheck_auth_token','synthetic_a');localStorage.setItem('crewcheck:text-size:v1:synthetic_a',String(size));localStorage.setItem('crewcheck:text-size:v1:synthetic_b','100');localStorage.setItem('fixture-seeded','1');}window.Notification={requestPermission(){throw Error('Real permission forbidden');}};},size);
 const page=await context.newPage();
 for(const route of ['/watch','/telegram','/statistics']){await page.goto(origin+route);await page.locator('[data-route]').waitFor();await measured(page,'direct '+route,size);await page.reload();await page.locator('[data-route]').waitFor();await measured(page,'reload '+route,size);}
 await page.evaluate(()=>window.fixtureNavigate('/home'));await page.locator('[data-route="Home"]').waitFor();await measured(page,'Home mounted',size);
 for(const route of ['/watch','/telegram','/statistics','/home','/watch']){await page.evaluate(route=>window.fixtureNavigate(route),route);await page.waitForFunction(route=>location.pathname===route,route);await page.locator('[data-route]').waitFor();await measured(page,'SPA '+route,size);}
 check(await page.evaluate(()=>window.fixtureSave(200)),'real preference setter accepted');await measured(page,'change away from Home',200);
 const second=await context.newPage();await second.goto(origin+'/watch');await second.locator('[data-route]').waitFor();await measured(second,'second tab persisted',200);
 await second.evaluate(()=>window.fixtureSave(150));await page.waitForTimeout(30);await measured(page,'storage sync away from Home',150);
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic_b',name:'Synthetic',email:'synthetic_b@example.invalid'}));localStorage.setItem('crewcheck_auth_token','synthetic_b');window.dispatchEvent(new Event('crewcheck:auth-changed'));});await page.locator('[data-route]').waitFor();await measured(page,'account B isolation',100);
 await page.evaluate(()=>{localStorage.removeItem('crewcheck_auth_user');localStorage.removeItem('crewcheck_auth_token');window.dispatchEvent(new Event('crewcheck:auth-changed'));});await page.waitForFunction(()=>location.pathname==='/login');await measured(page,'logout default',100);
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic_a',name:'Synthetic',email:'synthetic_a@example.invalid'}));localStorage.setItem('crewcheck_auth_token','synthetic_a');window.dispatchEvent(new Event('crewcheck:auth-changed'));window.fixtureNavigate('/statistics');});await page.locator('[data-route="InfoPage"]').waitFor();await measured(page,'account A restored',150);
 await page.evaluate(()=>window.fixtureUnmount());check(await page.evaluate(()=>!document.documentElement.dataset.crewTextSize&&!document.documentElement.style.getPropertyValue('--cc-text-scale')),'App unmount releases document ownership');await page.evaluate(()=>window.dispatchEvent(new Event('crewcheck:text-size-changed')));check(await page.evaluate(()=>!document.documentElement.dataset.crewTextSize),'App unmount removes preference listeners');
 await context.close();
 }
 const report={checks,failures,measurements,localRequests:requests,realProviderRequests:0,scope:'Actual App/Router/Protected/auth/preference/notice; bounded route content and unrelated support stubs; synthetic Chromium Apple UA, not physical Safari'};
 if(process.env.GLOBAL_TEXT_REPORT)fs.writeFileSync(process.env.GLOBAL_TEXT_REPORT,JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));assert.equal(failures.length,0,failures.join('; '));console.log(`PASS ${checks} global preference lifetime checks`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
