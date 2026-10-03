const {chromium}=require(require('path').resolve(process.env.CHAT_PLAYWRIGHT_MODULE || 'node_modules/playwright'));
const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert');
const dist=path.resolve('dist'),out=path.resolve('artifacts/chat-receive'); fs.mkdirSync(out,{recursive:true});
(async()=>{
 const server=http.createServer((req,res)=>{let file=path.join(dist,new URL(req.url,'http://local').pathname);if(!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(dist,'index.html');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;let browser;
 try{browser=await chromium.launch({...(process.env.CHAT_CHROMIUM_PATH ? {executablePath:process.env.CHAT_CHROMIUM_PATH} : {}),args:['--no-sandbox']});
 const messages=[],tests=[],errors=[];let gets=0,revoked=false;
 async function account(mine){const context=await browser.newContext({locale:'pt-BR',viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();let result={ok:true},status=200;
 if(u.pathname==='/api/platform/visitor/data')result={ok:true,visitor:{displayName:mine,permissions:{chat:true}},owner:{displayName:'Titular sintético'}};
 else if(u.pathname==='/api/platform/visitor/chat'){
 if(revoked){status=403;result={ok:false,message:'Acesso revogado.'};}
 else{if(route.request().method()==='POST'){const body=route.request().postDataJSON();messages.push({id:String(messages.length+1),sender:mine,body:body.message,createdAt:new Date().toISOString()});}else gets++;result={ok:true,threadId:'synthetic',messages:messages.map(m=>({...m,mine:m.sender===mine}))};}}
 else{status=503;result={ok:false};}return route.fulfill({status,contentType:'application/json',body:JSON.stringify(result)});});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/visitor');await page.getByPlaceholder('Mensagem',{exact:true}).waitFor();return{context,page};}
 const a=await account('A'),b=await account('B');
 await a.page.getByPlaceholder('Mensagem',{exact:true}).fill('Mensagem sintética A para B');await a.page.getByRole('button',{name:'Enviar',exact:true}).click();
 await b.page.getByText('Mensagem sintética A para B',{exact:true}).waitFor({timeout:10000});assert.equal(await b.page.getByPlaceholder('Mensagem',{exact:true}).inputValue(),'');tests.push('B receives without typing');
 await b.page.waitForTimeout(4400);assert.equal(await b.page.getByText('Mensagem sintética A para B',{exact:true}).count(),1);tests.push('Repeated GET does not duplicate message');
 await b.context.setOffline(true);await b.page.evaluate(()=>window.dispatchEvent(new Event('offline')));await b.page.getByRole('status').filter({hasText:'Sem conexão'}).waitFor();
 await a.page.getByPlaceholder('Mensagem',{exact:true}).fill('Durante offline');await a.page.getByRole('button',{name:'Enviar',exact:true}).click();await a.page.getByText('Durante offline',{exact:true}).waitFor();
 await b.context.setOffline(false);await b.page.evaluate(()=>window.dispatchEvent(new Event('online')));await b.page.getByText('Durante offline',{exact:true}).waitFor({timeout:10000});tests.push('Offline/reconnect catches up');
 await b.page.reload();await b.page.getByText('Durante offline',{exact:true}).waitFor();assert.deepEqual(await b.page.locator('.cv-messages p span').allTextContents(),['Mensagem sintética A para B','Durante offline']);tests.push('Reload preserves server order');
 await b.page.screenshot({path:out+'/visitor-receive.png'});
 revoked=true;await b.page.evaluate(()=>window.dispatchEvent(new Event('focus')));await b.page.getByRole('status').filter({hasText:'Acesso revogado.'}).waitFor();assert.equal(await b.page.locator('.cv-messages').count(),0);const before=gets;await b.page.waitForTimeout(4500);assert.equal(gets,before);tests.push('Revocation clears messages and stops polling');
 revoked=false;await b.page.getByRole('button',{name:'Chat',exact:true}).first().click();await b.page.getByText('Durante offline',{exact:true}).waitFor();tests.push('Explicit reopening retries after authorization is restored');
 assert.deepEqual(errors,[]);fs.writeFileSync(out+'/browser-report.json',JSON.stringify({tests,errors,note:'Synthetic API fixture shared by two isolated browser contexts. No production requests; not physical push validation.'},null,2));console.log(tests);
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
