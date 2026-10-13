const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=process.argv[2]||process.cwd(),home=fs.readFileSync(root+'/client/src/pages/Home.tsx','utf8'),source=fs.readFileSync(root+'/client/src/lib/watchContext.ts','utf8');
const ast=ts.createSourceFile('Home.tsx',home,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const names=['radarSnapshotKey','radarEventOperationalDate','radarSnapshotMatchesEvent','readRadarSnapshot','confirmedRadarGate'];
const functions=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');assert.equal(functions.match(/function /g).length,5);
let now=Date.parse('2026-10-03T03:00:00Z');class Clock extends Date{static now(){return now}}
const mod={exports:{}};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:mod.exports,require:()=>({getStoredUser:()=>({premiumAccess:true})}),Date:Clock,Intl});
const event={id:'synthetic-A',kind:'flight',flightNumber:'ZZ9001',origin:'AAA',destination:'BBB',gate:'',presentation:'06:00',departure:'07:00',arrival:'09:00',canonical:{startDateTime:'2026-10-03T07:00:00Z',endDateTime:'2026-10-03T09:00:00Z'}};
const data=new Map(),sent=[];const env={...mod.exports,Date:Clock,Intl,RADAR_CARD_CACHE_TTL_MS:21600000,storage:{get:(k,d)=>data.get(k)||d},eventStartDateTime:e=>new Date(e.canonical.startDateTime),event,events:[event],window:{dispatchEvent:e=>sent.push(e.detail)},CustomEvent:class{constructor(t,o){this.detail=o.detail}}};
vm.createContext(env);vm.runInContext(ts.transpileModule(functions,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,env);
const start=home.indexOf("    let lastSignature = '';");const end=home.indexOf('\n    publishWatchSnapshot(true);',start);assert.ok(start>=0&&end>start);vm.runInContext(ts.transpileModule(home.slice(start,end)+'\nthis.publish=publishWatchSnapshot;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,env);
const base={ok:true,flight:event.flightNumber,origin:event.origin,destination:event.destination,operationalDate:env.radarEventOperationalDate(event),updatedAt:now,gate:'TEST9'};
function publish(record){data.set(env.radarSnapshotKey(env.event),JSON.stringify(record));env.publish(true);return sent.at(-1)}
assert.equal(publish(base).gate,'TEST9');assert.equal(event.gate,'');
for(const change of [{flight:'OTHER'},{operationalDate:'2026-10-02'},{origin:'CCC'},{destination:'DDD'},{updatedAt:now+1},{updatedAt:now-21600000},{ok:false},{gate:'A confirmar'}])assert.equal(publish({...base,...change}).gate,'',JSON.stringify(change));
publish(base);env.event={...event,id:'synthetic-B',flightNumber:'ZZ9002'};env.events=[env.event];env.publish(true);assert.equal(sent.at(-1).gate,'');assert.equal(sent.at(-1).currentFlight,'ZZ9002');assert.notEqual(sent.at(-1).contextId,sent.at(-2).contextId);
env.event={id:'none',placeholder:true,kind:'duty'};env.events=[];env.publish(true);assert.equal(sent.at(-1).gate,'');assert.equal(sent.at(-1).state,'OFF_DUTY');
console.log(JSON.stringify({status:'PASS',root,scope:'Real Radar identity readers + real Watch builder + real publication closure',checks:['valid gate','immutable event','wrong flight/date/origin/destination excluded','future/expired/unavailable/placeholder excluded','event change clears gate','off-duty clears gate'],realAPIs:false}));
