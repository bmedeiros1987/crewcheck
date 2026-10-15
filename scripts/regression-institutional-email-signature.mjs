import { crewCheckEmailIdentity, crewCheckEmailSignatureText as institutionalSignatureText } from '../shared/crewcheckEmailIdentity.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function functions(file, names) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return names.map(name => {
    const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.ok(fn, `actual source function ${name}`); return fn.getText(source).replace(/^export\s+/, '');
  }).join('\n');
}
const deliveryFile='server/v139/delivery.mjs', partnerFile='server/v1410/partnerAccounts.mjs';
const delivery=fs.readFileSync(deliveryFile,'utf8'),calls=[],settings={MAILERSEND_API_KEY:'synthetic-key',MAILERSEND_FROM:'sender@example.invalid',CREWCHECK_EMAIL_FROM_LOCK:'sender@example.invalid',EMAILSENDER_API_URL:'https://example.invalid/email',EMAILSENDER_API_KEY:'synthetic-key',EMAILSENDER_FROM:'sender@example.invalid'};
const scope=vm.createContext({console,Buffer,setTimeout,clearTimeout,crewCheckEmailIdentity,institutionalSignatureText,
  env:(name,fallback='')=>settings[name]??fallback,flag:(_name,fallback)=>fallback,
  safeEmail:value=>String(value||'').trim().toLowerCase(),cleanText:value=>String(value||''),
  defaultLogoUrl:delivery.match(/const defaultLogoUrl = '([^']+)'/)[1],defaultBcc:'',
  postJson:async(url,_key,payload)=>{calls.push({url,payload});return {ok:true,status:202,raw:''};},
  sendSmtp:()=>{throw Error('No real SMTP allowed');},logEmailAttempt:()=>{},
  emailQuota:async()=>({remaining:100}),registerEmailSent:async()=>{},
});
vm.runInContext(functions(deliveryFile,['escapeHtml','crewCheckEmailSignatureText','crewCheckEmailSignature','optionalEmail','normalizeMessage','sendMailerSend','sendEmailSenderApi','sendSystemEmail'])+'\nglobalThis.api={crewCheckEmailSignature,crewCheckEmailSignatureText,normalizeMessage,sendSystemEmail,sendEmailSenderApi};',scope);
const {api}=scope,html=api.crewCheckEmailSignature(),text=api.crewCheckEmailSignatureText();
for(const value of [html,text]){assert.match(value,/CrewCheck/);assert.match(value,/crewcheck\.online/);assert.doesNotMatch(value,/Bruno|Medeiros|Saraiva|Founder|CEO|Brasília|CNPJ|mailto:/i,'institutional footer contains no personal/legal/contact invention');}
const logo=new URL(html.match(/<img src="([^"]+)"/)[1]);assert.equal(logo.origin,'https://crewcheck.online');
const asset='client/public'+logo.pathname;assert.ok(fs.existsSync(asset),'default logo is a committed public asset');assert.equal(fs.readFileSync(asset).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
if(process.argv.includes('--built'))assert.equal(fs.readFileSync('dist'+logo.pathname).subarray(0,8).toString('hex'),'89504e470d0a1a0a','built site ships the exact image path');
assert.match(html.replace(/<img\b[^>]*>/g,''),/>CrewCheck<\/div>/,'readable text brand survives blocked images');
settings.CREWCHECK_EMAIL_LOGO_URL='https://crewcheck.online/favicon-512x512.png';assert.equal(api.crewCheckEmailSignature(),html,'legacy broken logo configuration maps to shipped asset');
settings.CREWCHECK_EMAIL_LOGO_URL='https://example.invalid/brand.png';assert.match(api.crewCheckEmailSignature(),/https:\/\/example.invalid\/brand.png/,'other existing logo overrides remain intact');delete settings.CREWCHECK_EMAIL_LOGO_URL;
const message={to:'fixture@example.invalid',subject:'SYNTHETIC BODY',text:'SYNTHETIC TEXT',html:'<p>SYNTHETIC HTML</p>',bcc:false,replyTo:false};
await api.sendSystemEmail(message);assert.equal(calls.length,1);assert.equal(calls[0].payload.html,message.html+html);assert.equal(calls[0].payload.text,message.text+'\n\n'+text);assert.equal(calls[0].payload.subject,message.subject);assert.equal(calls[0].payload.from.email,settings.MAILERSEND_FROM);assert.ok(!('template_id' in calls[0].payload),'complete HTML sent by code, not provider template');assert.ok(!calls[0].payload.bcc&&!calls[0].payload.reply_to);
await api.sendEmailSenderApi(api.normalizeMessage(message));assert.equal(calls[1].payload.html,calls[0].payload.html);assert.equal(calls[1].payload.text,calls[0].payload.text,'both provider paths use the same signature');
assert.equal(api.normalizeMessage({...message,appendSignature:false}).html,message.html,'opt-out semantics preserved');
vm.runInContext(functions(partnerFile,['templateText','textToHtml','deliveryError','deliverInvitation'])+'\nglobalThis.invite=deliverInvitation;',scope);
await scope.invite({db:{query:async()=>[]},email:'fixture@example.invalid',contactName:'SYNTHETIC CONTACT',partnerName:'SYNTHETIC PARTNER',temporaryPassword:'SYNTHETIC-NOT-A-CODE',copyMe:false});
const invite=calls.at(-1).payload;assert.ok(invite.html.endsWith(html));assert.ok(invite.text.endsWith(text));assert.doesNotMatch(invite.html+invite.text,/Bruno|Medeiros|Saraiva|Founder|CEO/i);assert.match(invite.text,/SYNTHETIC-NOT-A-CODE/,'fixture body untouched');
console.log('PASS actual signature and provider payload builders: institutional HTML/plaintext, recovery-style body preserved, partner shared footer, opt-out, shipped PNG, image-blocked text fallback; synthetic in-memory mocks only, no network or emails sent');
