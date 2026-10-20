import copy
import json
from journal_transport import PlannedJournalTransport
from planned_mobile import digest
p=dict(package='com.crewcheck.app',owner='mobile:123',producer='mobile',sourceSha='a'*40,controllerSha='b'*40,runId='123',modules=['app']);p['planSha256']=digest(p)
binding=dict(schema=2,generation=1,plan=p)
record=dict(schema=2,package=p['package'],owner=p['owner'],generation=1,revision=1,state='planned',plan=p,history=[])
for scenario in ('valid','duplicate','extra','foreign','boolean-revision','wrong-generation','history','flag','missing','state'):
 calls=[]
 def exchange(frame):
  calls.append(frame);f=json.loads(frame);r=copy.deepcopy(record)
  if scenario=='extra':r['secret']='forbidden'
  if scenario=='foreign':r['plan']['sourceSha']='0'*40
  if scenario=='boolean-revision':r['revision']=True
  if scenario=='wrong-generation':r['generation']=2
  if scenario=='history':r['history']=[{}]
  if scenario=='flag':r['storeMutationAllowed']=True
  if scenario=='missing':del r['history']
  if scenario=='state':r['state']='reconciled'
  response=dict(schema=2,id=f['id'],status='ok',record=r,retryAllowed=False,storeAvailability='unknown')
  serialized=json.dumps(response)
  if scenario=='duplicate':serialized=serialized.replace('"schema": 2','"schema": 2, "schema": 2',1)
  return serialized
 t=PlannedJournalTransport(exchange,binding)
 if scenario=='valid':assert t.request('reserve',p)==record
 else:
  try:t.request('reserve',p)
  except RuntimeError:pass
  else:raise AssertionError(scenario)
  assert t.blocked
  try:t.request('read',{})
  except AssertionError:pass
  else:raise AssertionError('retry accepted')
  assert len(calls)==1
print('PASS schema-v2 Python transport rejects malformed/foreign/forged outcome responses and blocks after uncertainty')
