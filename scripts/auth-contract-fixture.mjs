import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
export const syntheticUser = { id: 'auth-contract', email: 'auth@example.invalid', name: 'SYNTHETIC AUTH' };
export const flushAuth = () => new Promise(resolve => setImmediate(resolve));

/** Executes the whole real client module and Protected body. Only I/O/hooks are synthetic. */
export function authFixture() {
  const data=new Map(),sessionData=new Map(),listeners=new Map(),requests=[],routes=[],states=[],timers=new Map();let timerId=0,effect,cleanup;
  const storage=values=>({getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)});
  const window={localStorage:storage(data),sessionStorage:storage(sessionData),addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},removeEventListener:(name,fn)=>listeners.get(name)?.delete(fn),dispatchEvent:event=>{for(const fn of [...listeners.get(event.type)||[]])fn(event);}};
  const context={exports:{},require,window,localStorage:window.localStorage,sessionStorage:window.sessionStorage,Event:class{constructor(type){this.type=type;}},CustomEvent:class{constructor(type){this.type=type;}},AbortController,
    setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
    fetch:(url,options)=>new Promise((resolve,reject)=>{requests.push({url,options,reject,respond:(status,payload)=>resolve({ok:status>=200&&status<300,status,json:async()=>payload})});options?.signal?.addEventListener('abort',()=>reject(new Error('SYNTHETIC_ABORT')),{once:true});})};
  vm.runInNewContext(compile(fs.readFileSync('client/src/lib/authClient.ts','utf8')),context);
  const auth=context.exports;
  const ast=ts.createSourceFile('App.tsx',fs.readFileSync('client/src/App.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const functions=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&['Protected','enablePartnerDemoRoster'].includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');
  const protectedContext={...context,...auth,useEffect:fn=>{effect=fn;},useState:value=>[value,next=>states.push(next)],useLocation:()=>['/app',next=>routes.push(next)],CrewCheckOpeningSplash:()=>null,TermsGate:()=>null};
  vm.runInNewContext(compile(functions+'\nglobalThis.mount=()=>{Protected({children:null});};'),protectedContext);
  return {auth,data,sessionData,requests,routes,states,timers,window,
    seed(token='expired-synthetic-token',user=syntheticUser){data.set('crewcheck_auth_token',token);data.set('crewcheck_auth_user',JSON.stringify(user));data.set('crewcheck_latest_roster_bundle','SYNTHETIC_ROSTER');sessionData.set('crewcheck_roster','SYNTHETIC_ROSTER');},
    mount(){protectedContext.mount();cleanup=effect();},unmount(){cleanup?.();},
    async advance(ms){for(const [id,timer]of [...timers])if(timer.ms<=ms){timers.delete(id);timer.fn();}await flushAuth();},
  };
}

export function realServerMe(dependencies) {
  const source=fs.readFileSync('server/v139/auth.mjs','utf8');
  const ast=ts.createSourceFile('auth.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='me');
  if(!fn)throw new Error('Real server me handler missing');
  const context={...dependencies};vm.runInNewContext(fn.getText(ast)+';globalThis.handler=me;',context);return context.handler;
}
