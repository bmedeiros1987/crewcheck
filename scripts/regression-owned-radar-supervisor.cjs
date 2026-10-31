const assert=require('node:assert/strict'),fs=require('node:fs');
let accepts;
if(process.argv[2]){
 const source=fs.readFileSync(process.argv[2],'utf8'),expression=source.match(/const passed=([^;]+);/);
 assert(expression,'actual legacy supervisor expression');
 const legacy=Function('child','text','mutation','return '+expression[1]);
 accepts=(child,mutation)=>legacy(child,(child.stdout||'')+(child.stderr||''),mutation);
}else accepts=require('./lib/owned-radar-supervisor.cjs').acceptsOwnedRadarResult;
const result=(status=1,text='ORACLE_GATE',extra={})=>({status,signal:null,stdout:'',stderr:text,...extra});
const cases=[
 ['positive normal',result(0,''),'',true],['positive nonzero',result(1,''),'',false],
 ['positive error',result(0,'',{error:Error('synthetic')}),'',false],['positive signal',result(0,'',{signal:'SIGTERM'}),'',false],['positive null status',result(null,''),'',false],
 ['gate correct',result(),'gate',true],['date correct',result(1,'ORACLE_OCCURRENCE'),'date',true],['provider correct',result(1,'ORACLE_PROVIDER'),'provider',true],
 ['wrong provider marker',result(1,'ORACLE_PROVIDER'),'gate',false],['wrong date marker',result(1,'ORACLE_OCCURRENCE'),'gate',false],
 ['mixed markers',result(1,'ORACLE_GATE ORACLE_PROVIDER'),'gate',false],['null status',result(null),'gate',false],
 ['spawn error',result(1,'ORACLE_GATE',{error:Error('synthetic spawn')}),'gate',false],['signalled exit',result(1,'ORACLE_GATE',{signal:'SIGTERM'}),'gate',false],
 ['signalled null status',result(null,'ORACLE_GATE',{signal:'SIGKILL'}),'gate',false],['timeout',result(null,'ORACLE_GATE',{error:{code:'ETIMEDOUT'}}),'gate',false],
 ['zero mutant exit',result(0),'gate',false],['negative status',result(-1),'gate',false],['invalid status',result(256),'gate',false],
 ['missing marker',result(1,''),'gate',false],['unknown mutation',result(),'unknown',false],['marker suffix',result(1,'ORACLE_GATE_OTHER'),'gate',false],
];
const failures=[];for(const[name,child,mutation,expected]of cases)if(Boolean(accepts(child,mutation))!==expected)failures.push(name);
assert.deepEqual(failures,[],'supervisor must accept only normal exits with the exact matching mutant marker');
console.log('PASS owned Radar supervisor: '+cases.length+' normal/error/signal/status/marker contracts');
