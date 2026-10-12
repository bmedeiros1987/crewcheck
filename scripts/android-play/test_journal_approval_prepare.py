import copy
import json
import subprocess
import tempfile
from pathlib import Path
from unittest.mock import patch
from prepare_journal_approval import prepare,comment,main,ENVIRONMENT_NAME
from journal_connection_probe import probe,main as probe_main
from receipt_backend import snapshot_digest,snapshot_json
ROOT=Path(__file__).resolve().parents[2]
meta=dict(id=123,run_attempt=1,repository=dict(id=1254349963,owner=dict(id=214496369),full_name='bmedeiros1987/crewcheck'),head_sha='b'*40,head_branch='main',event='workflow_dispatch',actor=dict(id=214496369),run_started_at='1970-01-01T02:46:40Z')
env=dict(GITHUB_REPOSITORY='bmedeiros1987/crewcheck',GITHUB_REF='refs/heads/main',GITHUB_EVENT_NAME='workflow_dispatch',GITHUB_RUN_ID='123',GITHUB_RUN_ATTEMPT='1',GITHUB_ACTOR_ID='214496369',GITHUB_SHA='b'*40,GITHUB_WORKFLOW_SHA='b'*40,REVIEWED_SOURCE_SHA='b'*40)
p=prepare(meta,env);assert p['operations']==['probe'] and p['issuedAt']==10000 and p['binding']['plan']['owner']=='mobile:123:1'
text=comment(p,'789','a'*64)
code="import fs from 'node:fs';import {parseApprovalComment} from './server/release-journal/github-review.mjs';console.log(JSON.stringify(parseApprovalComment(fs.readFileSync(0,'utf8'))));"
r=subprocess.run(['node','--input-type=module','-e',code],cwd=ROOT,input=text,text=True,capture_output=True,check=True,timeout=30);assert json.loads(r.stdout)['approvalSha256']==snapshot_digest(p)
for change in [{'run_attempt':2},{'head_sha':'a'*40},{'head_branch':'topic'},{'run_started_at':'2026-02-30T00:00:00Z'}]:
 try:prepare(dict(meta,**change),env)
 except (AssertionError,ValueError):pass
 else:raise AssertionError('Divergent plan source accepted')
with tempfile.TemporaryDirectory() as tmp:
 summary=Path(tmp)/'summary';out=Path(tmp)/'plan'
 with patch.dict('os.environ',dict(env,GITHUB_STEP_SUMMARY=str(summary))),patch('prepare_journal_approval.public_get',return_value=meta):
  main(['prepare','--output',str(out)]);main(['comment','--output',str(out),'--artifact-id','789','--archive-digest','a'*64])
 assert ENVIRONMENT_NAME in summary.read_text()
 assert text in summary.read_text() and 'CC-' in summary.read_text() and 'nenhuma versão será publicada' in summary.read_text()
 assert not any(word in summary.read_text() for word in ['PRIVATE KEY','ACTIONS_ID_TOKEN','DATABASE_URL'])
calls=[]
def exchange(method,url,headers,data):
 calls.append((method,url,headers,data))
 if method=='GET':return {'value':'fixture.token.signature'}
 frame=json.loads(data);assert frame['operation']=='probe' and frame['input']=={}
 return dict(schema=2,id=frame['id'],status='ok',namespace='com.crewcheck.app',connectionVerified=True,retryAllowed=False,storeMutationAllowed=False)
probe(p,'https://pipelines.actions.githubusercontent.com/fixture?id=1','ephemeral-fixture',exchange)
assert len(calls)==2 and calls[0][1].endswith('audience=crewcheck%3Arelease-journal%3Acom.crewcheck.app')
assert calls[1][1]=='https://crewcheck.onrender.com/api/platform/release-journal'
for url in ['http://pipelines.actions.githubusercontent.com/x','https://attacker.test/x','https://pipelines.actions.githubusercontent.com/x?audience=other']:
 try:probe(p,url,'fixture',exchange)
 except AssertionError:pass
 else:raise AssertionError('Unsafe token request accepted')
print('PASS fixed reviewed preparation generates full copy-ready approval and short display reference; Python/Node canonical equivalence, attempt/source/date checks, no credentials; probe is HTTPS-fixed and one-shot')
