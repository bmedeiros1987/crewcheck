const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const path = require('node:path');
function load(file, overrides = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code, {exports, require(name) {
    if (name in overrides) return overrides[name];
    if (name.startsWith('@/')) return {CREWCHECK_FOUNDER_PHOTO:'/founder.png'};
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file),name+'.ts'),overrides);
    return require(name);
  }, ...overrides.__globals}, {filename:file});
  return exports;
}
const app = fs.readFileSync('client/src/App.tsx','utf8');
assert.match(app, /<Route path="\/atualizacoes" component={PublicUpdatesPage}/);
assert.match(app, /publicPaths = \['\/atualizacoes'/);
for (const file of ['AboutUsPage','PublicUpdatesPage']) {
  const html = renderToStaticMarkup(React.createElement(load(`client/src/pages/${file}.tsx`).default));
  const copy = html.replace(/<style>[\s\S]*?<\/style>/g,'');
  assert.doesNotMatch(copy,/Fundador verificado|oito anos|API|WhatsApp|Asaas|PR1076|diárias exatas|R\$/i);
  for (const href of [...html.matchAll(/href="([^"]+)"/g)].map(m=>m[1])) {
    assert.ok(href.startsWith('mailto:suporte@crewcheck.com.br') || href==='/' || app.includes(`path="${href}"`), `Destino inválido: ${href}`);
  }
  assert.match(html,/data-crew-theme/); assert.match(html,/href="\/terms"/); assert.match(html,/href="\/privacy"/);
}
async function statusTest(fetcher, expected, forbidden, failRefresh = false) {
  let states=[], cursor=0, effect, tick;
  const mock = {...React,useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],value=>states[i]=value]},useEffect(fn){effect=fn},useMemo(fn){return fn()}};
  const Page=load('client/src/pages/SystemStatusPage.tsx',{react:mock,__globals:{fetch:fetcher,window:{setInterval(fn){tick=fn;return 1},clearInterval(){}}}}).default;
  renderToStaticMarkup(React.createElement(Page)); effect();
  await new Promise(resolve=>setImmediate(resolve));
  if (failRefresh) { tick(); await new Promise(resolve=>setImmediate(resolve)); }
  cursor=0;
  const html=renderToStaticMarkup(React.createElement(Page)).replace(/<style>[\s\S]*?<\/style>/g,'');
  assert.match(html,expected);if(forbidden)assert.doesNotMatch(html,forbidden);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function statusRaceTest(newestSucceeds, oldSucceeds, delayedOldBody = false, oldFinishesFirst = false) {
  let states = [], cursor = 0, effect, tick;
  const requests = [deferred(), deferred()];
  let requestIndex = 0;
  const mock = { ...React,
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value; }]; },
    useEffect(fn) { effect = fn; }, useMemo(fn) { return fn(); },
  };
  const Page = load('client/src/pages/SystemStatusPage.tsx', { react: mock, __globals: {
    fetch: () => requests[requestIndex++].promise,
    window: { setInterval(fn) { tick = fn; return 1; }, clearInterval() {} },
  } }).default;
  const render = () => { cursor = 0; return renderToStaticMarkup(React.createElement(Page)).replace(/<style>[\s\S]*?<\/style>/g, ''); };
  render(); effect();
  const oldBody = deferred();
  if (delayedOldBody) {
    requests[0].resolve({ ok: true, json: () => oldBody.promise });
    await new Promise(resolve => setImmediate(resolve));
  }
  tick();
  const settle = (request, success) => success
    ? request.resolve({ ok: true, json: async () => ({ enabled: false }) })
    : request.reject(new Error('offline'));
  if (oldFinishesFirst) {
    settle(requests[0], oldSucceeds);
    await new Promise(resolve => setImmediate(resolve));
    assert.match(render(), /Consultando o sistema/, 'An older completion must not finish loading the newest pending check');
  }
  settle(requests[1], newestSucceeds);
  await new Promise(resolve => setImmediate(resolve));
  const newestHtml = render();
  if (delayedOldBody) oldBody.resolve({ enabled: false });
  else settle(requests[0], oldSucceeds);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(render(), newestHtml, 'An older result must not overwrite the newest status attempt');
  assert.match(newestHtml, newestSucceeds ? /CrewCheck operacional/ : /Não foi possível confirmar a situação agora/);
}
(async()=>{
 await statusTest(()=>Promise.reject(new Error('offline')),/Não foi possível confirmar a situação agora/,/CrewCheck operacional|Funcionando normalmente|Nenhuma manutenção/);
 await statusTest(()=>Promise.resolve({ok:false}),/Não foi possível confirmar a situação agora/,/CrewCheck operacional/);
 await statusTest(()=>Promise.resolve({ok:true,json:async()=>null}),/Não foi possível confirmar a situação agora/,/CrewCheck operacional/);
 await statusTest(()=>Promise.resolve({ok:true,json:async()=>({enabled:true,title:'Manutenção real',message:'Trabalho em andamento'})}),/Manutenção real/,/CrewCheck operacional/);
 await statusTest(()=>Promise.resolve({ok:true,json:async()=>({enabled:false})}),/CrewCheck operacional/);
 let calls=0; await statusTest(()=>++calls===1 ? Promise.resolve({ok:true,json:async()=>({enabled:true,title:'Manutenção real'})}) : Promise.reject(Error('offline')),/Manutenção real[\s\S]*Não foi possível confirmar/,/CrewCheck operacional/,true);
 await statusRaceTest(false, true);
 await statusRaceTest(true, false);
 await statusRaceTest(false, true, true);
 await statusRaceTest(true, false, false, true);
 console.log('Public editorial: links, copy, public route, failure states and real maintenance OK');
})();
