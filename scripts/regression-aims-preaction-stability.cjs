const assert=require('node:assert/strict'),vm=require('node:vm');
const {stabilizeAimsPreAction}=require('./lib/aims-preaction-stability.cjs');
async function scenario({moving=false,layoutShift=false,tail=false,zoomShift=false,noFrames=false}={}){
  let time=0,y=1637;const wallStart=Date.now();
  const viewport={scrollLeft:5734,scrollTop:0,getBoundingClientRect:()=>({width:390,height:500})};
  const target={textContent:'QA9029',getBoundingClientRect:()=>({left:40-5734,top:2000-y+(layoutShift&&time>=48?2:0),width:80,height:30})};
  const context=vm.createContext({setTimeout,clearTimeout,performance:{now:()=>noFrames?Date.now()-wallStart:time},scrollX:0,get scrollY(){return y;},
    document:{documentElement:{scrollHeight:3000},querySelector:s=>s==='.cc-doc-viewport'?viewport:{textContent:zoomShift&&time>=48?'110%':'100%'},querySelectorAll:()=>[target]},
    requestAnimationFrame:callback=>{if(noFrames)return;time+=16;if(moving)y++;else if(tail&&time<=48)y++;context.scrollY=y;callback();}});
  return vm.runInContext('('+stabilizeAimsPreAction.toString()+')({timeoutMs:160,stableMs:64})',context);
}
(async()=>{
  const fixed=await scenario();assert.ok(fixed.elapsedMs>=64);
  const tail=await scenario({tail:true});assert.equal(tail.initial[1],1637);assert.equal(tail.stable[1],1640);assert.ok(tail.elapsedMs>=112);
  await assert.rejects(scenario({moving:true}),/did not stabilize within 160ms/);
  await assert.rejects(scenario({layoutShift:true}),/layout changed/);
  await assert.rejects(scenario({zoomShift:true}),/layout changed/);
  await assert.rejects(scenario({noFrames:true}),/did not stabilize within 160ms/);
  console.log('PASS AIMS bounded stabilization: settled scroll, perpetual motion, app layout shift and zoom change');
})().catch(error=>{console.error(error);process.exitCode=1;});
