import assert from 'node:assert/strict';
import {canonical,snapshotDigest} from './reconcile_journal.mjs';
import {createGitHubReviewProvider,APPROVAL_PREFIX} from '../../server/release-journal/github-review.mjs';
import {reviewFixture} from './release_review_fixture.mjs';
for(const scenario of ['valid','missing','generic-comment','old-attempt','wrong-reviewer','wrong-env','wrong-node','wrong-code','wrong-job','partial-jobs','changed-artifact','deleted-artifact','altered-plan','conflict','cancelled','rejected']){
 const f=reviewFixture(),provider=createGitHubReviewProvider({policy:f.policy,request:f.request,now:()=>10000});const frame={binding:f.binding,operation:'probe'};
 if(scenario==='missing')f.state.reviews=[];
 if(scenario==='generic-comment')f.state.reviews[0].comment='approved';
 if(scenario==='old-attempt'){const d=structuredClone(f.doc);d.approval.runAttempt='2';d.approvalSha256=snapshotDigest(d.approval);f.state.reviews[0].comment=APPROVAL_PREFIX+canonical(d);}
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
