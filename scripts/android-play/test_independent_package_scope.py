"""Package separation with fictional sessions only; no credentials or real API."""
import copy
import hashlib
import json
import os
from pathlib import Path
import tempfile
import types
import re
import runpy
import shlex
import sys
from unittest.mock import patch
from urllib.parse import unquote
import allocate_versions as allocator
import publish as publisher
from review_policy import MUST_NOT_DEFER_REVIEW
POLICY=json.loads(Path(__file__).with_name('release-policy.json').read_text())
WATCH=allocator.WATCHFACE_PACKAGE;SHARED=allocator.SHARED_PACKAGE
REPO=Path(__file__).resolve().parents[2]
application_id=re.search(r"applicationId\s+'([^']+)'",(REPO/'android-wrapper/watchface/build.gradle').read_text()).group(1)
assert application_id==WATCH
workflow=(REPO/'.github/workflows/android.yml').read_text()
commands=[shlex.split(line.strip()[5:]) for line in workflow.splitlines() if line.strip().startswith('run: python3 scripts/android-play/') and any(name in line for name in ('allocate_versions.py','publish.py'))]
assert len(commands)==2 and all('--package' not in command for command in commands), 'Workflow package intent changed: review explicit scope before updating this guard test'
selected=allocator.select_live_package_policy(POLICY,WATCH)
assert set(selected['artifacts'])=={'watchface'} and set(selected['knownMaxVersionCode'])=={WATCH}
for package in (None,SHARED,'com.foreign.app'):
 try:allocator.select_live_package_policy(POLICY,package)
 except AssertionError:pass
 else:raise AssertionError('Shared/foreign scope enabled')

class Response:
 ok=True;content=b'json'
 def __init__(self,body):self.body=body
 def json(self):return copy.deepcopy(self.body)
 def raise_for_status(self):assert self.ok

def modules(play,gh):
 g=types.ModuleType('google');g.__path__=[];a=types.ModuleType('google.auth');a.__path__=[];t=types.ModuleType('google.auth.transport');t.__path__=[];r=types.ModuleType('google.auth.transport.requests');o=types.ModuleType('google.oauth2');o.__path__=[];s=types.ModuleType('google.oauth2.service_account')
 g.auth=a;a.transport=t;t.requests=r;g.oauth2=o;o.service_account=s
 r.AuthorizedSession=lambda _credentials:play
 s.Credentials=types.SimpleNamespace(from_service_account_info=lambda *_args,**_kwargs:object())
 req=types.ModuleType('requests');req.Session=lambda:gh
 return {'google':g,'google.auth':a,'google.auth.transport':t,'google.auth.transport.requests':r,'google.oauth2':o,'google.oauth2.service_account':s,'requests':req}

for scenario in ('allocate','publish','required-review-mode','unknown-commit'):
 with tempfile.TemporaryDirectory() as temp:
  root=Path(temp);old_cwd=Path.cwd();os.chdir(root)
  try:
   policy_path=root/'scripts/android-play/release-policy.json';policy_path.parent.mkdir(parents=True);policy_path.write_text(json.dumps(POLICY))
   data=b'fictional resource-only WatchFace';(root/'watchface.aab').write_bytes(data)
   report=[dict(module='watchface',file='watchface.aab',sha256=hashlib.sha256(data).hexdigest(),**POLICY['artifacts']['watchface'])]
   # Explicit scope can select WatchFace from an otherwise complete joint archive.
   for m in ('app','wear'):report.append(dict(module=m,file=f'{m}.aab',sha256='0'*64,**POLICY['artifacts'][m]))
   (root/'release-report.json').write_text(json.dumps(report));(root/'resolved-release-policy.json').write_text(json.dumps(POLICY))
   calls=[];commits=[];floor=POLICY['knownMaxVersionCode'][WATCH];target='wear:internal' if POLICY['artifacts']['watchface']['track']=='wear:qa' else 'internal'
   class Play:
    def request(self,method,url,**kwargs):
     calls.append((method,url));assert WATCH in url and SHARED+'/' not in url
     if method=='POST' and url.endswith('/edits'):return Response({'id':'watchface-edit'})
     if method=='GET' and url.endswith('/tracks'):return Response({'tracks':[{'track':target,'releases':[]}]})
     if method=='GET' and url.endswith('/bundles'):return Response({'bundles':[{'versionCode':floor}]})
     if method=='GET' and url.endswith('/apks'):return Response({'apks':[{'versionCode':floor+1 if scenario=='allocate' else floor}]})
     if method=='POST' and 'uploadType=media' in url:return Response({'versionCode':POLICY['artifacts']['watchface']['versionCode']})
     if method=='PUT':assert '/tracks/'+target in unquote(url);return Response({})
     if method=='POST' and url.endswith(':commit'):
      commits.append(kwargs.get('params',{}));assert commits[-1]['changesInReviewBehavior']=='ERROR_IF_IN_REVIEW'
      if scenario=='required-review-mode' and len(commits)==1:raise RuntimeError(MUST_NOT_DEFER_REVIEW)
      if scenario=='unknown-commit':raise TimeoutError('fixture unknown response')
      return Response({'id':'watchface-edit'})
     raise AssertionError('Unexpected fictional call')
    def delete(self,url,**kwargs):calls.append(('DELETE',url));assert WATCH in url;return Response({})
   gh=types.SimpleNamespace(headers={},get=lambda *_args,**_kwargs:Response({'workflow_runs':[dict(id=2,workflow_id=22,event='push',name='Independent fixture CI',status='completed',conclusion='success')]}))
   env={'GITHUB_REF':'refs/heads/main','GITHUB_EVENT_NAME':'workflow_dispatch','PLAY_SERVICE_ACCOUNT_JSON':'fictional','GH_TOKEN':'fictional','GITHUB_REPOSITORY':'bmedeiros1987/crewcheck','GITHUB_SHA':'a'*40,'GITHUB_RUN_ID':'1'}
   with patch.dict(os.environ,env),patch.dict('sys.modules',modules(Play(),gh)),patch('credential.load_service_account_secret',return_value={'fixture':True}),patch.object(publisher,'load_service_account_secret',return_value={'fixture':True}):
    if scenario=='allocate':
     allocator.main(['--package',WATCH]);resolved=json.loads(policy_path.read_text())
     assert resolved['artifacts']['watchface']['versionCode']==floor+2
     for m in ('app','wear'):assert resolved['artifacts'][m]==POLICY['artifacts'][m]
     assert resolved['knownMaxVersionCode'][SHARED]==POLICY['knownMaxVersionCode'][SHARED]
    else:
     try:publisher.main([str(root),'--package',WATCH])
     except TimeoutError:assert scenario=='unknown-commit'
     else:assert scenario!='unknown-commit'
     assert len([x for x in calls if x[0]=='PUT'])==1
     assert len(commits)==(2 if scenario=='required-review-mode' else 1)
     if scenario=='unknown-commit':assert not any(method=='DELETE' for method,_ in calls)
    assert calls and all(WATCH in url for _,url in calls)
   # Default joint path fails before even constructing a client.
   with patch.dict(os.environ,env),patch.object(publisher,'load_service_account_secret',side_effect=AssertionError('credential reached')):
    try:publisher.main([str(root)])
    except AssertionError as error:assert 'disabled' in str(error) and 'credential reached' not in str(error)
    else:raise AssertionError('Uncoordinated shared-package publication enabled')
  finally:os.chdir(old_cwd)
# Exercise the actual checked-in workflow commands, not only selection helpers.
# The mixed archive must stop before client/credential access. No subprocess or
# shell command can escape these in-process fictitious module/credential guards.
with tempfile.TemporaryDirectory() as temp:
 root=Path(temp);old_cwd=Path.cwd();os.chdir(root)
 try:
  path=root/'scripts/android-play/release-policy.json';path.parent.mkdir(parents=True);path.write_text(json.dumps(POLICY))
  archive=root/'verified-bundles';archive.mkdir();(archive/'resolved-release-policy.json').write_text(json.dumps(POLICY))
  (archive/'release-report.json').write_text(json.dumps([dict(module=m,file=m+'.aab',sha256='0'*64,**spec) for m,spec in POLICY['artifacts'].items()]))
  env={'GITHUB_REF':'refs/heads/main','GITHUB_EVENT_NAME':'workflow_dispatch'}
  for command in commands:
   script=REPO/command[1]
   with patch.dict(os.environ,env),patch.object(sys,'argv',[str(script),*command[2:]]),patch('credential.load_service_account_secret',side_effect=AssertionError('credential reached')) as secret:
    try:runpy.run_path(str(script),run_name='__main__')
    except AssertionError as error:assert 'Live shared-package writer disabled' in str(error)
    else:raise AssertionError('Actual mixed workflow command opened Store scope')
    assert secret.call_count==0
  # Explicit selection must still refuse namespace-confused or tampered reports
  # before reading a credential. Keep the existing fake-client positive cases.
  original=json.loads((archive/'release-report.json').read_text());data=b'fictional WatchFace';(archive/'watchface.aab').write_bytes(data)
  good=[dict(module=m,file=m+'.aab',sha256=hashlib.sha256(data).hexdigest(),**spec) for m,spec in POLICY['artifacts'].items()]
  for bad_field,bad_value in [('package','com.crewcheck.face'),('package',SHARED),('sha256','f'*64)]:
   report=copy.deepcopy(good);next(item for item in report if item['module']=='watchface')[bad_field]=bad_value
   (archive/'release-report.json').write_text(json.dumps(report))
   with patch.dict(os.environ,env),patch.object(publisher,'load_service_account_secret',side_effect=AssertionError('credential reached')) as secret:
    try:publisher.main([str(archive),'--package',WATCH])
    except AssertionError as error:assert 'credential reached' not in str(error)
    else:raise AssertionError('Bad explicit package/report reached Store')
    assert secret.call_count==0
 finally:os.chdir(old_cwd)
print('PASS build-only allocation guard and explicit independent WatchFace scope: shared package untouched/blocked; protected review mode, unknown commit preserved; fictional API only')
