// Passed directly to page.evaluate: keep this function self-contained.
async function stabilizeAimsPreAction({timeoutMs=1500,stableMs=100}={}) {
  const viewport=document.querySelector('.cc-doc-viewport');
  const target=[...document.querySelectorAll('.cc-doc-token button')].find(el=>el.textContent.includes('QA9029'));
  if(!viewport||!target)throw Error('Missing AIMS preparation target');
  const read=()=>{
    const rect=target.getBoundingClientRect(),frame=viewport.getBoundingClientRect();
    return {position:[scrollX,scrollY,viewport.scrollLeft,viewport.scrollTop],
      // Document coordinates remove scrolling, but retain actual layout movement.
      layout:[rect.left+scrollX+viewport.scrollLeft,rect.top+scrollY+viewport.scrollTop,
        rect.width,rect.height,frame.width,frame.height,document.documentElement.scrollHeight,
        document.querySelector('.cc-doc-toolbar output').textContent]};
  };
  const initial=read(),started=performance.now();let prior=JSON.stringify(initial.position),stableSince=started,frames=0;
  while(performance.now()-started<timeoutMs){
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('AIMS pre-action scroll did not stabilize within '+timeoutMs+'ms')),Math.max(1,timeoutMs-(performance.now()-started)));
      requestAnimationFrame(()=>{clearTimeout(timer);resolve();});
    });
    const current=read(),now=performance.now();
    if(JSON.stringify(current.layout)!==JSON.stringify(initial.layout))throw Error('AIMS layout changed during pre-action stabilization');
    const position=JSON.stringify(current.position);
    if(position!==prior){prior=position;stableSince=now;frames=0;}else frames++;
    if(now-started<timeoutMs&&frames>=3&&now-stableSince>=stableMs)return {elapsedMs:now-started,initial:initial.position,stable:current.position};
  }
  throw Error('AIMS pre-action scroll did not stabilize within '+timeoutMs+'ms');
}
module.exports={stabilizeAimsPreAction};
