import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import crypto from 'node:crypto';
import spans from './telegram-binding/source-spans.mjs';import{resolvePlatformEntitlement}from'../server/platform-entitlement.mjs';
const source=fs.readFileSync('server/platform.mjs','utf8');assert(source.includes('telegram-visitor-private-transport-v1'));const nodes=spans.createSourceFile('server/platform.mjs',source).statements;
const code=['handlePlatformVisitorTelegram','allowedPermissions','normalizeText','visitorDaySummary','parseDateOnly'].map(name=>{const fn=nodes.find(n=>n.name?.text===name);assert(fn,name);return fn.getText().replace(/^export /,'');}).join('\n');
const X='9000012345',Y='9000012346',owner='visitor-owner@example.invalid',invite='synthetic_visitor_invite_123';let visitor,plan,reads,writes,rosterReads,hotelReads,decrypts,emergencies;const sent=[];
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function reset(){visitor={id:'synthetic-visitor',owner_email:owner,email:'visitor@example.invalid',status:'active',telegram_chat_id:X,telegram_token_hash:hash(invite),permissions:{roster:true,hotels:true}};plan='premium_unlimited';reads=0;writes=0;rosterReads=0;hotelReads=0;decrypts=0;emergencies=0;sent.length=0;}
const db={async query(sql,args){reads++;
 if(sql.includes('WHERE telegram_token_hash='))return{rows:visitor?.telegram_token_hash===args[0]&&['active','invited'].includes(visitor.status)?[structuredClone(visitor)]:[]};
 if(sql.startsWith('UPDATE crewcheck_platform_visitors')){assert.equal(args[0],visitor.id);assert(sql.includes('AND telegram_token_hash=$4'));if(visitor.telegram_token_hash!==args[3]||!['active','invited'].includes(visitor.status))return{rows:[],rowCount:0};visitor.telegram_chat_id=args[1];visitor.telegram_token_hash=args[2];writes++;return{rows:[],rowCount:1};}
 if(sql.includes('WHERE telegram_chat_id='))return{rows:visitor&&String(visitor.telegram_chat_id)===args[0]&&['active','invited'].includes(visitor.status)?[structuredClone(visitor)]:[]};
 if(sql.startsWith('SELECT * FROM crewcheck_platform_profiles')){assert.equal(args[0],owner);return{rows:[{email:owner,public_id:'synthetic-owner',plan}]};}
 if(sql.startsWith('SELECT roster FROM crewcheck_platform_rosters')){assert.equal(args[0],owner);rosterReads++;return{rows:[{roster:{days:[{date:new Date(Date.now()+86400000).toISOString().slice(0,10),type:'SYNTHETIC DUTY',legs:[]}]}}]};}
 if(sql.startsWith('SELECT * FROM crewcheck_platform_stays')){assert.equal(args[0],owner);assert(sql.includes('share_with_visitors=TRUE'));hotelReads++;return{rows:[{stay_date:'SYNTHETIC DATE',hotel_name:'SYNTHETIC HOTEL',room_cipher:'SYNTHETIC CIPHER',presentation_time:'05:00'}]};}
 assert.fail('unexpected query outside visitor namespace');
}};
const ctx=vm.createContext({pool:async()=>db,sha256:hash,retiredTokenHash:()=> 'synthetic-retired',subscriptionStatus:async(_db,profile)=>resolvePlatformEntitlement(profile,null),decryptPrivate:()=>{decrypts++;return'SYNTHETIC PRIVATE ROOM';},notifyOwnerEmergency:async(_db,v)=>{assert.equal(v.id,visitor.id);emergencies++;return{email:false,telegram:false};}});vm.runInContext(code+'\nglobalThis.handle=handlePlatformVisitorTelegram;',ctx);
const message=(chat=X,type='private',sender=chat)=>({chat:{id:chat,type},from:{id:sender}}),send=async(id,text)=>{sent.push({id,text});return{ok:true};};let checks=0;
reset();for(const m of[message('-100123','group',X),message(X,'supergroup',X),message(X,'private',Y),{chat:{id:X,type:'private'}}]){assert.equal(await ctx.handle(m,'/start visitor_'+invite,send),false);assert.equal(reads,0);assert.equal(writes,0);assert.equal(sent.length,0);checks++;}
reset();visitor.telegram_chat_id='';assert.equal(await ctx.handle(message(),'/start visitor_'+invite,send),true);assert.equal(writes,1);assert.equal(visitor.telegram_chat_id,X);assert.equal(visitor.telegram_token_hash,'synthetic-retired');assert(sent[0].text.includes('visitante'));checks++;
reset();await ctx.handle(message(),'/escala',send);assert.equal(rosterReads,1);assert(sent[0].text.includes('SYNTHETIC DUTY'));assert.equal(writes,0);checks++;
reset();visitor.permissions={roster:false};await ctx.handle(message(),'/escala',send);assert.equal(rosterReads,0);assert(!sent[0].text.includes('SYNTHETIC DUTY'));checks++;
reset();visitor.status='invited';await ctx.handle(message(),'/escala',send);assert.equal(rosterReads,0);assert.match(sent[0].text,/primeiro acesso/);checks++;
reset();visitor.status='revoked';assert.equal(await ctx.handle(message(),'/escala',send),false);assert.equal(rosterReads,0);assert.equal(sent.length,0);checks++;
reset();plan='free';await ctx.handle(message(),'/escala',send);assert.equal(rosterReads,0);assert.match(sent[0].text,/pausado/);checks++;
reset();visitor.permissions={hotels:true,room:false,presentation:false};await ctx.handle(message(),'/hotel',send);assert.equal(hotelReads,1);assert.equal(decrypts,0);assert(!sent[0].text.includes('PRIVATE ROOM'));assert(!sent[0].text.includes('05:00'));checks++;
reset();visitor.permissions={hotels:false,room:true};await ctx.handle(message(),'/hotel',send);assert.equal(hotelReads,0);assert.equal(decrypts,0);checks++;
reset();visitor.permissions={emergency:true};plan='free';await ctx.handle(message(),'/emergencia SYNTHETIC HELP',send);assert.equal(emergencies,1);assert.equal(rosterReads,0);checks++;
reset();visitor.permissions={emergency:false};await ctx.handle(message(),'/emergencia SYNTHETIC HELP',send);assert.equal(emergencies,0);checks++;
reset();assert.equal(await ctx.handle(message(Y),'/escala',send),false);assert.equal(rosterReads,0);assert.equal(sent.length,0);checks++;
console.log(`PASS actual prepared visitor private guard: ${checks} synthetic cases; group/foreign/missing sender performs zero SQL or delivery, private invite stays visitor-only, existing roster/hotel/emergency ACL preserved; no real data/messages, no late-revocation attestation`);
