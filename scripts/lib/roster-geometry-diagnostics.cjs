// Synthetic browser evidence. Diagnostics do not decide acceptance.
const fs=require('node:fs'),path=require('node:path');
async function captureRosterGeometry({page,browser,selector,file,caseInfo}) {
 const report={caseInfo,engine:browser.version(),viewport:page.viewportSize(),selector,warnings:[]};
 try { report.layout=await page.evaluate(selector=>({userAgent:navigator.userAgent,dpr:devicePixelRatio,viewport:{innerWidth,innerHeight,clientWidth:document.documentElement.clientWidth,clientHeight:document.documentElement.clientHeight},fontFaces:[...document.fonts].map(f=>({family:f.family,status:f.status})),nodes:[...document.querySelectorAll(selector)].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(e);const dialog=e.closest('dialog');return {text:(e instanceof HTMLSelectElement?e.selectedOptions[0]?.textContent:e.textContent)?.slice(0,256),rect:{x:r.x,y:r.y,width:r.width,height:r.height},font:s.font,fontFamily:s.fontFamily,whiteSpace:s.whiteSpace,wordBreak:s.wordBreak,overflowWrap:s.overflowWrap,padding:[s.paddingLeft,s.paddingRight],clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,clientHeight:e.clientHeight,scrollHeight:e.scrollHeight,textRects:[...range.getClientRects()].map(r=>({x:r.x,y:r.y,width:r.width,height:r.height})),dialog:dialog?{clientWidth:dialog.clientWidth,offsetWidth:dialog.offsetWidth,scrollHeight:dialog.scrollHeight,clientHeight:dialog.clientHeight,scrollbarGutter:getComputedStyle(dialog).scrollbarGutter}:null};})}),selector); } catch(e) {report.warnings.push('layout: '+e.message);}
 let session;
 try {session=await page.context().newCDPSession(page);await session.send('DOM.enable');await session.send('CSS.enable');const {root}=await session.send('DOM.getDocument');const {nodeIds}=await session.send('DOM.querySelectorAll',{nodeId:root.nodeId,selector});report.platformFonts=[];for(const nodeId of nodeIds){const {fonts}=await session.send('CSS.getPlatformFontsForNode',{nodeId});report.platformFonts.push(fonts);} } catch(e) {report.warnings.push('platform-fonts unavailable: '+e.message);} finally {await session?.detach().catch(()=>{});}
 if(file) {try {fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(report,null,2));}catch(e){report.warnings.push('file: '+e.message);}}
 console.error('ROSTER_GEOMETRY_DIAGNOSTIC '+JSON.stringify(report));
 return report;
}
module.exports={captureRosterGeometry};

// Browser functions: the reset and post-click measurement occupy the original gate's positions.
// No waits, scrolling repair, focus changes or relative acceptance are performed by diagnostics.
function beginLegendScrollProbe(el) {
 el.scrollTo({left:0,behavior:'instant'});
 const nodes=[];for(let n=el;n;n=n.parentElement)nodes.push(n);
 const target=el.lastElementChild,rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
 const describe=e=>e?{tag:e.tagName,id:e.id,className:String(e.className||''),filter:e.getAttribute?.('data-roster-filter'),connected:e.isConnected}:null;
 const snapshot=phase=>{
  const now=performance.now(),chain=[];for(let n=el;n;n=n.parentElement)chain.push(n);
  const ancestors=nodes.map((n,index)=>{const s=getComputedStyle(n);return {index,...describe(n),scrollLeft:n.scrollLeft,scrollTop:n.scrollTop,scrollWidth:n.scrollWidth,scrollHeight:n.scrollHeight,clientWidth:n.clientWidth,clientHeight:n.clientHeight,clientLeft:n.clientLeft,clientTop:n.clientTop,overflowX:s.overflowX,overflowY:s.overflowY,position:s.position,box:rect(n)};});
  const scrolling=document.scrollingElement,s=getComputedStyle(target);
  return {phase,at:now,timeOrigin:performance.timeOrigin,sameAncestors:chain.length===nodes.length&&chain.every((n,i)=>n===nodes[i]),ancestors,focus:describe(document.activeElement),target:describe(target),targetFocused:document.activeElement===target,targetBox:rect(target),targetFont:{font:s.font,fontFamily:s.fontFamily},viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visual:visualViewport?{width:visualViewport.width,height:visualViewport.height,offsetLeft:visualViewport.offsetLeft,offsetTop:visualViewport.offsetTop,scale:visualViewport.scale}:null},document:{scrollX,scrollY,rootClientWidth:document.documentElement.clientWidth,rootScrollWidth:document.documentElement.scrollWidth,scrolling:describe(scrolling),scrollLeft:scrolling?.scrollLeft,scrollTop:scrolling?.scrollTop},ancestorsHorizontalZero:ancestors.slice(1).every(n=>n.scrollLeft===0),ancestorsContained:ancestors.slice(1).every(n=>n.scrollWidth<=n.clientWidth+1)};
 };
 const events=[],record=event=>{if(event.target?.closest?.('button')===target)events.push(snapshot(event.type));};
 for(const name of ['pointerdown','focusin','click'])document.addEventListener(name,record,{capture:true,passive:true});
 window.__ccLegendScrollProbe={el,nodes,target,snapshot,baseline:snapshot('before-click-call'),events,cleanup:()=>{for(const name of ['pointerdown','focusin','click'])document.removeEventListener(name,record,true);}};
}
function finishLegendScrollProbe(el) {
 // Keep these reads first and unchanged from the acceptance gate.
 const moved=[];for(let n=el.parentElement;n;n=n.parentElement)if(n.scrollLeft)moved.push(n.className||n.tagName);
 const b=el.lastElementChild.getBoundingClientRect(),r=el.getBoundingClientRect();
 const sideways={scrollX:scrollX,moved,doc:document.documentElement.scrollWidth-innerWidth,visible:b.left>=r.left-.5&&b.right<=r.right+.5};
 const probe=window.__ccLegendScrollProbe;
 if(!probe||probe.el!==el)return {sideways,trace:{unavailable:'baseline strip identity missing'}};
 const after=probe.snapshot('original-post-click-measurement'),trace={baseline:probe.baseline,events:probe.events,after};probe.cleanup();delete window.__ccLegendScrollProbe;
 return {sideways,trace};
}
module.exports.beginLegendScrollProbe=beginLegendScrollProbe;
module.exports.finishLegendScrollProbe=finishLegendScrollProbe;
