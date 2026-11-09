// Test-only readiness for the floating BackToTop update. Not a replacement
// for the strict AIMS layout/scroll stabilizer or the interaction return baseline.
function installAimsScrollProbe() {
  if (window.__qaAimsScrollProbeInstalled) return;
  window.__qaAimsScrollProbeInstalled = true;
  document.addEventListener('scroll', event => {
    const header = document.querySelector('.cz-app > .cz-global-header');
    if (event.target === document) window.__qaAimsPageScroller = document.scrollingElement;
    else if (event.target instanceof Element && header && event.target.contains(header)) window.__qaAimsPageScroller = event.target;
  }, true);
}
async function waitForAimsScrollAffordance({timeoutMs=1500}={}) {
  const header=document.querySelector('.cz-app > .cz-global-header'),host=header?.closest('.cz-app'),root=document.scrollingElement;
  const viewport=document.querySelector('.cc-doc-viewport'),target=[...document.querySelectorAll('.cc-doc-token button')].find(e=>e.textContent.includes('QA9029'));
  if(!window.__qaAimsScrollProbeInstalled||!host||!root||!viewport||!target)throw Error('Missing AIMS scroll-affordance preparation context');
  const candidate=window.__qaAimsPageScroller;
  const scroller=candidate?.isConnected&&(candidate===root||candidate.contains(header))?candidate:root;
  const rect=e=>{const r=e.getBoundingClientRect();return [r.left+scrollX,r.top+scrollY,r.width,r.height];};
  const initialArrow=host.querySelector(':scope > .cc-back-to-top');
  const originalChildren=[...host.children].filter(e=>e!==initialArrow);
  const read=()=>{
    if(document.querySelector('dialog[open], [aria-modal="true"], .cz-menu-overlay, .cz-busy, .cc-play-update-notice'))throw Error('AIMS arrow preparation requires closed overlays and completed busy state');
    const arrow=host.querySelector(':scope > .cc-back-to-top'),height=scroller===root?innerHeight:scroller.clientHeight;
    const hostBox=host.getBoundingClientRect(),style=getComputedStyle(host);
    const decorations=JSON.stringify([style.display,style.position,style.transform,style.boxSizing,style.minHeight,style.paddingTop,style.paddingBottom,style.borderTopWidth,style.borderBottomWidth]);

    if(arrow&&getComputedStyle(arrow).position!=='fixed')throw Error('Floating arrow must not enter document flow');
    return {arrow,hostBottom:hostBox.bottom,decorations,expected:scroller.scrollTop>64&&scroller.scrollHeight>height+64,
      fixed:JSON.stringify({target:rect(target),frame:rect(viewport),pan:[viewport.scrollLeft,viewport.scrollTop],scroll:[scrollX,scrollY,scroller.scrollTop],zoom:document.querySelector('.cc-doc-toolbar output')?.textContent,children:originalChildren.map(rect)}),
      children:[...host.children].filter(e=>e!==arrow),doc:root.scrollHeight,hostHeight:host.getBoundingClientRect().height,hostScroll:host.scrollHeight,
      arrowRect:arrow?rect(arrow):null};
  };
  const initial=read(),start=performance.now();let previous='',stableFrames=0;
  while(performance.now()-start<timeoutMs){
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('AIMS arrow update did not complete within '+timeoutMs+'ms')),Math.max(1,timeoutMs-(performance.now()-start)));requestAnimationFrame(()=>{clearTimeout(timer);resolve();});});
    const current=read();
    if(current.fixed!==initial.fixed||current.decorations!==initial.decorations||current.children.length!==originalChildren.length||current.children.some((e,i)=>e!==originalChildren[i])) {
      const before=JSON.parse(initial.fixed),after=JSON.parse(current.fixed);
      throw Error('AIMS layout or scroll changed unexpectedly before arrow completion '+JSON.stringify({changed:Object.keys(before).filter(key=>JSON.stringify(before[key])!==JSON.stringify(after[key])),before:{target:before.target,frame:before.frame,pan:before.pan,scroll:before.scroll,zoom:before.zoom},after:{target:after.target,frame:after.frame,pan:after.pan,scroll:after.scroll,zoom:after.zoom}}));
    }
    const transition=current.arrow!==initialArrow,deltaDoc=current.doc-initial.doc,deltaHost=current.hostHeight-initial.hostHeight,deltaScroll=current.hostScroll-initial.hostScroll;
    // A floating action contributes zero extent. Never accept an unrelated shift
    // merely because its appearance/removal happened in the same interval.
    if(deltaDoc||deltaHost||deltaScroll)throw Error('AIMS document extent changed during floating arrow update');
    const signature=JSON.stringify({expected:current.expected,present:Boolean(current.arrow),rect:current.arrowRect,doc:current.doc,host:current.hostHeight,scroll:current.hostScroll});
    stableFrames=signature===previous?stableFrames+1:1;previous=signature;
    if(Boolean(current.arrow)===current.expected&&stableFrames>=2)return {elapsedMs:performance.now()-start,present:Boolean(current.arrow),expected:current.expected,transition,deltaDoc,deltaHost,deltaScroll,stableFrames};
  }
  throw Error('AIMS arrow update did not complete within '+timeoutMs+'ms');
}
module.exports={installAimsScrollProbe,waitForAimsScrollAffordance};
