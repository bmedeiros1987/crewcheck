import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
import {submitVerifiedTelegramBinding}from'../server/telegram-binding-delivery.mjs';
import{createTelegramBindingChallenge,consumeTelegramBindingChallenge,readVerifiedTelegramBinding,updateTelegramBindingMetadata}from'../server/telegram-binding-state.mjs';
import{telegramBindingMemory}from'./fixtures/telegram-binding-memory.mjs';
const sql=process.env.TELEGRAM_BINDING_QA==='isolated-mysql'?await(await import('./fixtures/telegram-binding-mysql.mjs')).telegramBindingMysqlFactory():null;
try{
 const f=sql?await sql.make():telegramBindingMemory(),email='local-qa@example.invalid',chatId='9000012345';
 await createTelegramBindingChallenge(f.pool,{email,code:'cc_local_transports'});await consumeTelegramBindingChallenge(f.pool,{code:'cc_local_transports',chatId,senderId:chatId,chatType:'private',username:'synthetic_user'});
 let binding=await readVerifiedTelegramBinding(f.pool,{email});binding=await updateTelegramBindingMetadata(f.pool,binding,{callMeBotVerifiedAt:new Date().toISOString()});
 const source=fs.readFileSync('server.mjs','utf8'),ast=ts.createSourceFile('server.mjs',source,99,true,ts.ScriptKind.JS),names=['sendBoundTelegramMessage','sendBoundTelegramVoiceCall','handleAlarmTest'];
 const functions=names.map(name=>{const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(node,name);return node.getText(ast);}).join('\n');
 let result,payload={},sent=0,called=0,phoned=0,refunds=0,unknown=false;
 const globals={telegramConfigured:()=>true,telegramCallProviderEnabled:()=>true,phoneCallConfigured:()=>true,telegramLinkedUsernameForEmailAsync:async()=>binding?.username||'',submitVerifiedTelegramBinding,conciergeDbPool:async()=>f.pool,telegramLinkedRecordForEmail:async()=>binding,alarmRequestIdentity:()=>({email,token:'synthetic',admin:true}),cc1371AuthRequired:()=>true,readJsonBody:async()=>payload,crewcheckRateLimit:()=>0,crewcheckAlarmTestRateLimit:{},cleanVoiceCallText:x=>x,telegramDefaultChatId:()=>'',envAny:()=>'',sendTelegramMessage:async()=>{sent++;return{ok:true};},sendTelegramVoiceCall:async()=>{called++;return unknown?{ok:false}:{ok:true};},sendAdminPhoneCall:async()=>{phoned++;return{ok:true};},sendJson:(_res,status,body)=>result={status,body},consumePlatformUsage:async()=>({allowed:true}),refundPlatformUsage:async()=>{refunds++;},String,Number};
 const ctx=vm.createContext(globals);vm.runInContext(functions+'\nglobalThis.run=handleAlarmTest;',ctx);
 const req={method:'POST',socket:{remoteAddress:'synthetic'}};
 payload={testType:'telegram-message',chatId:'9000099999'};await ctx.run(req,{});assert.equal(sent,0);assert.equal(result.body.ok,false);
 payload={testType:'telegram-message'};await ctx.run(req,{});assert.equal(sent,1);assert.equal(result.body.ok,true);
 payload={testType:'telegram-call'};await ctx.run(req,{});assert.equal(called,1);assert.equal(result.body.ok,true);
 unknown=true;await ctx.run(req,{});assert.equal(called,2);assert.equal(result.body.results[0].uncertain,true);assert.equal(refunds,0);
 payload={testType:'phone-call',phone:'SYNTHETIC'};binding=null;await ctx.run(req,{});assert.equal(phoned,1);assert.equal(result.body.ok,true);
 console.log(`PASS local prepared alarm transports (${sql?'isolated MySQL':'SQL double'}): foreign destination blocked, canonical message/call, unknown outcome and independent phone; no real messages`);
}finally{if(sql)await sql.close();}
