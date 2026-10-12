"""Actual mobile CLI main/flags + Python transport + Node protocol; fictional stores only."""
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import shutil
import tempfile
from unittest.mock import patch
os.environ['REVIEWED_SOURCE_SHA'] = 'a' * 40
import mobile_internal as m
from planned_mobile import PlannedMobileController, digest
from journal_transport import PlannedJournalTransport
SCRIPT = Path(__file__).with_suffix('.mjs').resolve()
POLICY = json.loads(Path(__file__).with_name('release-policy.json').read_text())
TRACKS = [{'track':'internal','releases':[{'status':'completed','versionCodes':['144150']}]},
          {'track':'wear:internal','releases':[{'status':'completed','versionCodes':['144153'],'releaseNotes':[{'language':'pt-BR','text':'Correções de navegação ✈️'}]}]},
          {'track':'production','releases':[{'status':'completed','versionCodes':['144154']}]}]


def exercise(scenario, isolated_qa=False, handoff=None):
 with tempfile.TemporaryDirectory() as temp:
  root=Path(temp);original_cwd=Path.cwd();os.chdir(root)
  try:
   policy_path=root/'policy.json';policy_path.write_text(json.dumps(POLICY));out=root/'out';out.mkdir()
   initial_tracks=copy.deepcopy(TRACKS)
   next_code=144156 if handoff is None else handoff['record']['history'][-1]['highWaterVersionCode']+1
   initial_bundles=[dict(versionCode=144154,sha256='a'*64)]
   if handoff is not None:
    previous=next_code-1;initial_tracks[0]['releases'][0]['versionCodes'].append(str(previous))
    initial_bundles.append(dict(versionCode=previous,sha256=hashlib.sha256(b'fictional-bundle').hexdigest()))
   for kind in ('bundle','apk'):
    p=root/f'android-wrapper/app/build/outputs/{kind}/release/app-release.{"aab" if kind=="bundle" else "apk"}';p.parent.mkdir(parents=True);p.write_bytes(b'fictional-'+kind.encode())
   p=dict(package=m.PACKAGE,owner='mobile:123',producer='mobile',sourceSha=m.SOURCE_SHA,controllerSha='b'*40,runId='123',modules=['app']);p['planSha256']=digest(p)
   if scenario=='wrong-binding':p['controllerSha']='d'*40;p['planSha256']=digest({k:v for k,v in p.items() if k!='planSha256'})
   if handoff is not None:p=copy.deepcopy(handoff['binding']['plan'])
   binding=copy.deepcopy(handoff['binding']) if handoff is not None else dict(schema=2,generation=1,plan=p);frames=[];state={'stagedTracks':copy.deepcopy(initial_tracks),'creates':0,'stages':0,'commits':0};last=None
   def exchange(frame):
    nonlocal last
    frames.append(frame)
    proof_root=root/'independent-finalization-snapshot'
    if json.loads(frame)['operation']=='finalize' and not proof_root.exists():shutil.copytree(out,proof_root)
    report=dict(binding=binding,frames=[frame] if isolated_qa else frames,isolatedQa=isolated_qa,stagedAlready=bool(state['stages']) if isolated_qa else False,priorCommits=state['commits'] if isolated_qa else 0,root=str(proof_root),file=f'CrewCheck-app-{next_code}.aab',versionCode=next_code,initialBundles=initial_bundles,tracks=initial_tracks,stagedTracks=state['stagedTracks'],artifactSha256=hashlib.sha256(b'fictional-bundle').hexdigest(),certificateSha256=POLICY['uploadCertificateSha256'],scenario=scenario)
    try:result=subprocess.run(['node',str(SCRIPT)],input=json.dumps(report),text=True,capture_output=True,check=True,timeout=30)
    except subprocess.CalledProcessError as error:
     if scenario=='kill-pending-helper':
      assert isolated_qa and error.returncode==-9
      assert 'QA_V2_PENDING_READ_BEFORE_HELPER_SIGKILL' in error.stderr
      os.write(2,b'QA_V2_PENDING_READ_BEFORE_HELPER_SIGKILL\n');raise SystemExit(128)
     raise
    last=json.loads(result.stdout)
    if isolated_qa:state['commits']=last['commits']
    if scenario=='lost-transport' and json.loads(frame)['operation']=='commit':raise TimeoutError('lost reply')
    return last['responses'][-1]
   transport=PlannedJournalTransport(exchange,binding) if handoff is None else PlannedJournalTransport.from_handoff(exchange,binding,handoff['record'])
   def create(r):
    assert last['record']['state']=='allocation_started';state['creates']+=1
    if scenario=='lost-create':raise TimeoutError('lost edit-create response')
    return 'original-edit'
   def inventory(r):
    snapshot=dict(package=m.PACKAGE,editId='original-edit',edit=dict(id='original-edit',expiryTimeSeconds='99999999'),tracks=copy.deepcopy(initial_tracks),bundles=copy.deepcopy(initial_bundles),apks=[dict(versionCode=144155)])
    return dict(snapshot,maxCode=next_code-1,inventorySha256=digest(snapshot),inventoryComplete=True)
   def stage(r,data,payload):
    assert last['record']['state']=='stage_started';state['stages']+=1;state['stagedTracks'][0]=payload
    if scenario=='kill-stage-runner':
     assert isolated_qa
     import signal
     os.write(2,b'QA_V2_STAGE_STARTED_BEFORE_RUNNER_SIGKILL\n');os.kill(os.getpid(),signal.SIGKILL)
    if scenario=='lost-stage':raise TimeoutError('lost staging reply')
   c=PlannedMobileController(transport,create,inventory,stage,start_record=handoff['record'] if handoff else None)
   ci=dict(sourceSha=m.SOURCE_SHA,reviewedPrHead='c'*40,runs=[dict(id=i+1,workflow_id=i+1,head_sha=m.SOURCE_SHA,event='push',head_branch='main',name=n,status='completed',conclusion='success') for i,n in enumerate(m.REQUIRED_CI)],prRuns=[dict(id=1,workflow_id=1,head_sha='c'*40,event='pull_request',name='Watch phone sync bridge',status='completed',conclusion='success')])
   (root/'mobile-source-ci.json').write_text(json.dumps(ci))
   def tools(args):
    if args[:2]==['git','rev-parse']:return m.SOURCE_SHA
    policy=json.loads(policy_path.read_text());spec=policy['artifacts']['app']
    xml=f'<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="{m.PACKAGE}" android:versionCode="{spec["versionCode"]}" android:versionName="{policy["versionName"]}"><uses-sdk android:minSdkVersion="{spec["minSdk"]}" android:targetSdkVersion="{spec["targetSdk"]}"/><application android:debuggable="false"/></manifest>'
    if scenario=='manifest-drift':xml=xml.replace(m.PACKAGE,'com.foreign.app')
    if args[0]=='java':return xml if 'dump' in args else ''
    if args[0]=='jarsigner':return 'jar verified.'
    if args[0]=='keytool':return 'SHA256: '+('0'*64 if scenario=='signer-drift' else POLICY['uploadCertificateSha256'])
    if args[0]=='fictional-apkanalyzer':return xml
    if args[0]=='fictional-apksigner':return 'Signer #1 certificate SHA-256 digest: '+POLICY['uploadCertificateSha256']
    raise AssertionError('Unexpected tool')
   env={'GITHUB_REF':'refs/heads/main','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_SHA':p['controllerSha'] if handoff else 'b'*40,'GITHUB_RUN_ID':p['runId'] if handoff else '123','EXPECTED_UPLOAD_CERT_SHA256':POLICY['uploadCertificateSha256'],'APK_ANALYZER':'fictional-apkanalyzer','APK_SIGNER':'fictional-apksigner','PUBLISH_MOBILE_INTERNAL':'true'}
   failure=None
   with patch.dict(os.environ,env),patch.object(m,'POLICY',policy_path),patch.object(m,'run',side_effect=tools),patch.object(m,'check_ci'),patch.object(m,'play_session',side_effect=AssertionError('Real session forbidden')):
    try:
     m.main(['allocate'],planned=c)
     m.main(['validate','--bundletool','fictional.jar','--output',str(out)],planned=c)
     assert json.loads((out/'mobile-release.json').read_text())['playSubmissionAllowed'] is False
     if scenario=='local-hash':(out/f'CrewCheck-app-{next_code}.aab').write_bytes(b'changed')
     m.main(['publish','--output',str(out)],planned=c)
    except (AssertionError,RuntimeError,TimeoutError) as e:failure=e
   if scenario=='wrong-binding':assert failure is not None and last is None and state['creates']==0;return
   assert last and state['creates']==1
   if scenario=='complete-proof':assert failure is None and last['record']['state']=='reconciled' and last['commits']==1
   else:
    assert failure is not None,scenario
    if scenario=='lost-create':assert last['record']['state']=='allocation_started' and state['stages']==0
    if scenario in ('wrong-edit','incomplete'):assert last['record']['state']=='edit_known' and last['commits']==0
    if scenario in ('signer-drift','manifest-drift'):assert last['record']['state']=='allocated' and state['stages']==0
    if scenario=='local-hash':assert last['record']['state']=='finalized' and state['stages']==0
    if scenario=='lost-stage':assert last['record']['state']=='stage_started' and last['commits']==0
    if scenario in ('other-track','remote-hash','review-pending'):assert last['record']['state']=='stage_started' and last['commits']==0
    if scenario=='lost-pending-sql':assert last['record']['state']=='pending' and last['commits']==0
    if scenario=='unknown-commit':assert last['record']['state']=='reconciliation_required' and last['commits']==1
    if scenario in ('original-gone','lost-transport'):assert last['record']['state']=='acknowledged' and last['commits']==1
    try:c.allocate(policy_path)
    except AssertionError:pass
    else:raise AssertionError('Implicit allocation retry accepted')
   assert all(x['method']=='GET' for x in last['calls']);return last
  finally:os.chdir(original_cwd)

if __name__ == '__main__':
 import sys
 if len(sys.argv)>1:
  assert sys.argv[1]=='--isolated-mysql' and len(sys.argv) in (3,5)
  assert os.environ.get('CREWCHECK_NOTIFICATION_QA')=='isolated-mysql'
  assert os.environ.get('CREWCHECK_QA_MYSQL_SOCKET')=='/tmp/crewcheck-notification-qa-socket/mysqld.sock'
  handoff=None
  if len(sys.argv)==5:
   assert sys.argv[3]=='--handoff';handoff=json.loads(Path(sys.argv[4]).read_text())
  exercise(sys.argv[2], isolated_qa=True, handoff=handoff)
 else:
  for scenario in ['wrong-binding','signer-drift','manifest-drift','complete-proof','original-gone','wrong-edit','incomplete','local-hash','remote-hash','other-track','review-pending','lost-create','lost-stage','lost-pending-sql','unknown-commit','lost-transport']:exercise(scenario)
  print('PASS real CLI allocate/validate/publish flags through schema-v2 Python/Node protocol; independent official-shaped reader, APK floor, signer/bytes, retained tracks, uncertain staging/commit/recovery; all fictional; real connection OFF')

  # Unconfigured executable entrypoint retains OFF guards before any session/API.
  with patch.object(m,'guard'),patch.dict(os.environ,{'PUBLISH_MOBILE_INTERNAL':'true'}),patch.object(m,'play_session',side_effect=AssertionError('session forbidden')),patch.object(m,'check_ci',side_effect=AssertionError('network forbidden')):
   for command in ('allocate','publish'):
    try:m.main([command])
    except AssertionError as error:assert 'disabled' in str(error).lower()
    else:raise AssertionError('Default executable unexpectedly enabled')
  print('PASS default real CLI has no transport or executor and remains OFF before any external session')
