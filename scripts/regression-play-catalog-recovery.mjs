import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
const source=fs.readFileSync('client/src/components/platform/PlatformCenter.tsx','utf8');
const ast=ts.createSourceFile('PlatformCenter.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),parts={};
function visit(n){if(ts.isVariableDeclaration(n)&&['products','errorListener'].includes(n.name.getText(ast)))parts[n.name.getText(ast)]=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);
let values={},queries=0;const request={current:'A'},errors=[];
const scope={module:{exports:{}},playCatalogRequest:request,setPlayProducts:v=>values=v,toast:{error:m=>errors.push(m)},queryCatalog:()=>queries++};
vm.runInNewContext(ts.transpileModule('module.exports={products:('+parts.products+'),error:('+parts.errorListener+')}',{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,scope);
const handlers=scope.module.exports,product={productId:'synthetic-plan',formattedPrice:'fixture',billingPeriod:'P1M'};
const receive=id=>handlers.products({detail:{requestId:id,products:[product]}});
receive('A');assert.equal(Object.keys(values).length,1);
handlers.error({detail:{message:'restore failed while connected',catalogInvalidated:false}});
assert.equal(request.current,'A','restore failure preserves correlation');assert.equal(Object.keys(values).length,1,'restore failure preserves confirmed products');
request.current='B';values={};handlers.error({detail:{message:'restore failed during catalog query',catalogInvalidated:false}});receive('A');assert.equal(Object.keys(values).length,0);receive('B');assert.equal(Object.keys(values).length,1,'in-flight matching catalog still completes');
handlers.error({detail:{message:'catalog query failed',catalogInvalidated:true}});assert.equal(request.current,null);assert.equal(Object.keys(values).length,0);receive('B');assert.equal(Object.keys(values).length,0,'invalidated generation never resurrected');
request.current='C';receive('B');assert.equal(Object.keys(values).length,0);receive('C');assert.equal(Object.keys(values).length,1,'explicit new correlated query recovers');
handlers.error({detail:{message:'legacy unknown error'}});assert.equal(request.current,null,'legacy errors stay fail-closed');assert.equal(Object.keys(values).length,0);assert.equal(queries,0,'errors never create query loops');assert.equal(errors.length,4);
console.log('PASS actual frontend handlers: restore retains catalog/correlation; stale/legacy/missing generations blocked; fresh query recovers, no retries or purchases.');
const java=fs.readFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckBillingBridge.java','utf8');
const helpers=[...java.matchAll(/^    private void dispatch(?:Catalog)?Error\([^\n]+\) \{[\s\S]*?^    \}/gm)].map(m=>m[0]).join('\n');
const restore=java.slice(java.indexOf('public void restorePurchases()'),java.indexOf('public void acknowledge('));assert.match(restore,/dispatchError\("Não foi possível restaurar/);
const queryBody=java.slice(java.indexOf('public void queryProductsForRequest('),java.indexOf('public void purchase('));
assert.equal((queryBody.match(/dispatchCatalogError\(/g)||[]).length,2,'both catalog-query failure paths explicitly invalidate');
assert.match(java.slice(java.indexOf('private void ensureReady('),java.indexOf('private void dispatchCatalogError(')),/dispatchCatalogError\(/,'connection failures stay fail-closed');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crewcheck-billing-recovery-'));
try{
fs.writeFileSync(path.join(dir,'BillingRecoveryProbe.java'),`import java.util.*;import java.util.concurrent.atomic.AtomicLong;
public class BillingRecoveryProbe {
 Map<String,String> products=new HashMap<>();AtomicLong catalogGeneration=new AtomicLong(7);JSONObject last;
 static class JSONObject extends HashMap<String,Object>{public Object put(String k,Object v){return super.put(k,v);}}
 static class BillingResult{int getResponseCode(){return 6;}}
 void dispatch(String name,JSONObject detail){last=detail;}
 ${helpers}
 static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
 public static void main(String[] args){BillingRecoveryProbe p=new BillingRecoveryProbe();p.products.put("synthetic-plan","confirmed");long inFlight=p.catalogGeneration.get();p.dispatchError("restore failed",new BillingResult());check(p.catalogGeneration.get()==inFlight,"restore invalidated in-flight catalog");check(p.products.size()==1,"restore erased native confirmed products");check(Boolean.FALSE.equals(p.last.get("catalogInvalidated")),"restore not classified");
 p.dispatchCatalogError("catalog failed",new BillingResult());check(p.catalogGeneration.get()==inFlight+1,"catalog failure must invalidate generation");check(p.products.isEmpty(),"catalog failure must erase products");check(Boolean.TRUE.equals(p.last.get("catalogInvalidated")),"catalog not classified");System.out.println("PASS compiled actual Java error methods: restoration preserves products/generation; catalog failure invalidates both.");}
}`);
const bin=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin'):'';
execFileSync(bin?path.join(bin,'javac'):'javac',[path.join(dir,'BillingRecoveryProbe.java')],{stdio:'inherit'});
execFileSync(bin?path.join(bin,'java'):'java',['-cp',dir,'BillingRecoveryProbe'],{stdio:'inherit'});
}finally{fs.rmSync(dir,{recursive:true,force:true});}
