import assert from 'node:assert/strict';
import {canonical,snapshotDigest} from './reconcile_journal.mjs';
import {createGitHubReviewProvider,APPROVAL_PREFIX} from '../../server/release-journal/github-review.mjs';
import {reviewFixture} from './release_review_fixture.mjs';
for(const scenario of ['valid','missing','generic-comment','old-attempt','wrong-reviewer','wrong-env','wrong-node','wrong-code','wrong-job','partial-jobs','changed-artifact','deleted-artifact','altered-plan','conflict','cancelled','rejected']){
 const f=reviewFixture({attempt:scenario==='old-attempt'?'2':'1'}),provider=createGitHubReviewProvider({policy:f.policy,request:f.request,now:()=>10000});const frame={binding:f.binding,operation:'probe'};
 if(scenario==='missing')f.state.reviews=[];
 if(scenario==='generic-comment')f.state.reviews[0].comment='approved';
 if(scenario==='old-attempt'){const d=structuredClone(f.doc);d.approval.runAttempt='1';d.approvalSha256=snapshotDigest(d.approval);f.state.reviews[0].comment=APPROVAL_PREFIX+canonical(d);}
 if(scenario==='wrong-reviewer')f.state.reviews[0].user.id=2;
 if(scenario==='wrong-env')f.state.reviews[0].environments[0].id=2;
 if(scenario==='wrong-node')f.state.reviews[0].environments[0].node_id='wrong';
 if(scenario==='wrong-code')f.state.meta.head_sha='a'.repeat(40);
 if(scenario==='wrong-job')f.state.jobs.jobs[0].name='unprotected';
 if(scenario==='partial-jobs')f.state.jobs.total_count=2;
 if(scenario==='changed-artifact')f.state.artifact.digest='sha256:'+'b'.repeat(64);
 if(scenario==='deleted-artifact')f.state.artifact.expired=true;
 if(scenario==='altered-plan')frame.binding={...f.binding,generation:2};
 if(scenario==='conflict'){const other=structuredClone(f.state.reviews[0]),d=structuredClone(f.doc);d.artifactId='790';other.comment=APPROVAL_PREFIX+canonical(d);f.state.reviews.push(other);}
 if(scenario==='cancelled')f.state.meta.conclusion='cancelled';
 if(scenario==='rejected')f.state.reviews[0].state='rejected';
 if(scenario==='valid'){const proof=await provider.verify(f.claims,frame);assert.equal(proof.state,'approved');assert(provider.isVerified(proof));assert(!provider.isVerified(structuredClone(proof)));assert(provider.isFresh(proof));assert.throws(()=>proof.approval.operations.push('reserve'));assert.throws(()=>{proof.approval.binding.plan.owner='forged';});}
 else if(['cancelled','rejected'].includes(scenario)){const p=await provider.verify(f.claims,frame);assert.equal(p.state,'revoked');assert(provider.isVerified(p));}
 else await assert.rejects(provider.verify(f.claims,frame));
 assert(f.state.calls.every(url=>url.startsWith('https://api.github.com/repos/bmedeiros1987/crewcheck/')));
}
console.log('PASS independent GitHub manual-review proof binds reviewer/environment/run/attempt/job/code/full plan/artifact; missing, stale, partial, forged and conflicting evidence denied; no credentials or provider approval by job');

// Expired authorization grants only bounded observation; never mutation or retry.
{let time=10100;const f=reviewFixture({operations:['observe','reserve']}),p=createGitHubReviewProvider({policy:f.policy,request:f.request,now:()=>time});
 assert.equal((await p.verify(f.claims,{binding:f.binding,operation:'observe'})).state,'approved');
 await assert.rejects(p.verify(f.claims,{binding:f.binding,operation:'reserve'}));time=11000;await assert.rejects(p.verify(f.claims,{binding:f.binding,operation:'observe'}));}

// Official attempt response path forms; jobs-by-attempt does not require run_attempt.
for(const suffix of ['', '@main','@refs/heads/main','@topic','@refs/tags/main','@main-evil']){
 const f=reviewFixture();f.state.meta.path='.github/workflows/mobile-only-internal.yml'+suffix;assert(!Object.hasOwn(f.state.jobs.jobs[0],'run_attempt'));
 const p=createGitHubReviewProvider({policy:f.policy,request:f.request,now:()=>10000});const operation={binding:f.binding,operation:'probe'};
 if(['','@main','@refs/heads/main'].includes(suffix))assert.equal((await p.verify(f.claims,operation)).state,'approved');else await assert.rejects(p.verify(f.claims,operation));
}
{const f=reviewFixture();f.state.jobs.jobs[0].run_attempt=2;const p=createGitHubReviewProvider({policy:f.policy,request:f.request,now:()=>10000});await assert.rejects(p.verify(f.claims,{binding:f.binding,operation:'probe'}));}
// Explicit fail-closed RUN-wide rejection policy: old rejection + new exact approval
// cannot authorize a rerun, because review history cannot independently date attempts.
{const f=reviewFixture({attempt:'2'}),old=reviewFixture({attempt:'1'}).state.reviews[0];old.state='rejected';f.state.reviews.push(old);
 const p=createGitHubReviewProvider({policy:f.policy,request:f.request,now:()=>10000});assert.equal((await p.verify(f.claims,{binding:f.binding,operation:'probe'})).state,'revoked');
 const next=reviewFixture({run:'124'}),p2=createGitHubReviewProvider({policy:next.policy,request:next.request,now:()=>10000});assert.equal((await p2.verify(next.claims,{binding:next.binding,operation:'probe'})).state,'approved');}
{const f=reviewFixture({attempt:'2'}),p=createGitHubReviewProvider({policy:f.policy,request:f.request,now:()=>10000});assert.equal((await p.verify(f.claims,{binding:f.binding,operation:'probe'})).state,'approved');assert(f.state.calls.some(url=>url.endsWith('/attempts/2/jobs?per_page=100&page=1')));f.state.jobs.jobs[0].check_run_url=f.state.jobs.jobs[0].check_run_url.replace('457','456');await assert.rejects(p.verify(f.claims,{binding:f.binding,operation:'probe'}));}
console.log('PASS official exact workflow/main path forms and jobs-by-attempt without fixture-only run_attempt; mismatched optional attempt denied; documented rejection blocks whole run, new run needs fresh exact approval');
