"""Cross-language wire contract through a test-only Node fixture, not a live executor."""
import json
from pathlib import Path
import subprocess
import journal_transport as m
binding=dict(package='com.crewcheck.app',owner='run:123:1',producer='mobile',sourceSha='a'*40,controllerSha='b'*40,runId='123',artifactSha256='c'*64,versionCode=144201)
intent={k:binding[k] for k in ('sourceSha','controllerSha','runId','artifactSha256','versionCode')}
frames=[]
def exchange(frame):
    frames.append(frame)
    result=subprocess.run(['node',str(Path(__file__).with_name('test_journal_protocol.mjs')),'--transport-fixture'],input=json.dumps(frames),text=True,capture_output=True,check=True)
    return json.loads(result.stdout)[-1]
client=m.JournalTransport(exchange,binding)
record=client.request('reserve',intent);assert record['revision']==1
opened=client.request('advance',intent,1,'edit_open');assert opened['revision']==2
assert client.request('read',intent,2)==opened
try:client.request('advance',intent,1,'edit_open')
except RuntimeError:pass
else:raise AssertionError('Stale frame accepted')
count=len(frames)
try:client.request('read',intent,2)
except AssertionError:pass
else:raise AssertionError('Blocked transport retried')
assert len(frames)==count
for reply in ['{}','not-json','{"schema":1,"schema":1}',json.dumps(dict(schema=True,id='request_1',status='ok',record=None,retryAllowed=False,storeAvailability='unknown'))]:
    calls=[]
    c=m.JournalTransport(lambda frame:(calls.append(frame) or reply),binding)
    try:c.request('reserve',intent)
    except RuntimeError:pass
    else:raise AssertionError('Malformed acknowledgment accepted')
    assert len(calls)==1 and c.blocked
calls=[]
def lost(frame):calls.append(frame);raise RuntimeError('private diagnostic')
c=m.JournalTransport(lost,binding)
try:c.request('reserve',intent)
except RuntimeError as error:assert 'private' not in str(error)
assert c.blocked and len(calls)==1
print('PASS: Python->Node frames bind owned revision/intent and reject malformed/lost acknowledgements without retry; fixture only')

for state in ('acknowledged', 'reconciled'):
    calls=[]
    c=m.JournalTransport(lambda frame:calls.append(frame),binding)
    try:c.request('advance',intent,1,state)
    except RuntimeError:pass
    else:raise AssertionError('Caller asserted store/reconciliation outcome')
    assert not calls and c.blocked
