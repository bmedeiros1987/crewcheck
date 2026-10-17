import copy
import json
from pathlib import Path
import subprocess
from journal_transport import PlannedJournalTransport
from planned_mobile import digest, PlannedMobileController
p=dict(package='com.crewcheck.app',owner='mobile:123',producer='mobile',sourceSha='a'*40,controllerSha='b'*40,runId='123',modules=['app']);p['planSha256']=digest(p)
a=dict(module='app',package=p['package'],versionCode=144156,sourceSha=p['sourceSha'],controllerSha=p['controllerSha'],manifestSha256='e'*64,uploadCertificateSha256='f'*64,artifactSha256='c'*64)
seed=dict(schema=2,package=p['package'],owner=p['owner'],generation=1,revision=8,state='reconciled',plan=p,history=[],editId='original',allocation=dict(inventorySha256='d'*64,floor=144155,versionCodes={'app':144156}),artifacts=[a],staged=dict(track='internal',expectedTrackSha256='d'*64,otherTracksBeforeSha256='e'*64),reconciliationSha256='f'*64)
old_binding=dict(schema=2,generation=1,plan=p)
next_plan=dict(p,owner='mobile:124',runId='124');next_plan['planSha256']=digest({k:v for k,v in next_plan.items() if k!='planSha256'})
next_binding=dict(schema=2,generation=2,plan=next_plan)
script=Path(__file__).with_suffix('.mjs')
for scenario in ['valid','approval-refused','binding-refused','proof-incomplete','lost-rollover-sql','new-executor-refused']:
 frames=[];last=None
 def exchange(frame):
  global last
  frames.append(frame)
  payload=dict(binding=old_binding,next=next_binding,record=seed,frames=frames,scenario=scenario)
  result=subprocess.run(['node',str(script)],input=json.dumps(payload),text=True,capture_output=True,check=True,timeout=30)
  last=json.loads(result.stdout);return last['responses'][-1]
 old=PlannedJournalTransport(exchange,old_binding);assert old.request('read',{},8)==seed
 try:handoff=old.request('rollover',next_binding,8)
 except RuntimeError:
  assert scenario in ('approval-refused','binding-refused','proof-incomplete','lost-rollover-sql')
  assert old.blocked
  assert last['record']['generation']==(2 if scenario=='lost-rollover-sql' else 1)
  assert last['record']['state']==('planned' if scenario=='lost-rollover-sql' else 'reconciled')
  continue
 assert old.retired and handoff['generation']==2 and handoff['revision']==9 and handoff['state']=='planned'
 assert handoff['history'][0]['reconciliationSha256']==seed['reconciliationSha256']
 try:old.request('read',{},9)
 except AssertionError:pass
 else:raise AssertionError('Old transport reused after rollover')
 try:new=PlannedJournalTransport.from_handoff(exchange,next_binding,handoff)
 except RuntimeError:
  assert scenario=='new-executor-refused';continue
 assert scenario=='valid'
 assert new.record==handoff and new.binding==next_binding
 # Explicit controller handoff accepts only the verified planned next generation.
 controller=PlannedMobileController(new,lambda _: 'new-edit',lambda _: {},lambda *_:None,start_record=handoff)
 assert controller.start_record==handoff
 for bad in [dict(handoff,state='stage_started'),dict(handoff,generation=1),dict(handoff,owner='foreign')]:
  try:PlannedMobileController(new,lambda _:None,lambda _:None,lambda *_:None,start_record=bad)
  except AssertionError:pass
  else:raise AssertionError('Unsafe automatic resume accepted')
print('PASS serialized rollover requires separate next binding approval/proof, keeps history/global revision, retires old transport; new executor exact readback, uncertain/refused handoffs remain locked')
