"""Actual Python receipt contract -> Node protocol/journal, fictional SQL only."""
import copy
import json
from pathlib import Path
import subprocess
from receipt_journal import DurableJournal
from receipt_backend import ReceiptBackend, snapshot_digest
from journal_transport import JournalTransport

BINDING = dict(package='com.crewcheck.app', owner='run:123:1', producer='mobile', sourceSha='a'*40, controllerSha='b'*40, runId='123', artifactSha256='c'*64, versionCode=144201)
BASE = dict(package=BINDING['package'], sourceSha=BINDING['sourceSha'], versionCode=BINDING['versionCode'], sha256=BINDING['artifactSha256'])
OPEN = dict(BASE, state='edit_open', editId='edit1')
PENDING = dict(OPEN, state='pending', track='qa', expectedTrack={'track':'qa','releases':[{'name':'Atualização ✈️','status':'completed','versionCodes':['144201']}]}, otherTracksBefore={}, committed=None, acknowledged=False, verified=False)

class Fixture:
    def __init__(self): self.frames=[]; self.lose_sql_at=None; self.lose_reply=False; self.last=None; self.finish_after=None; self.final_outcome=None; self.reconcile_after=None
    def run(self, uncertain=False):
        result=subprocess.run(['node',str(Path(__file__).with_suffix('.mjs'))],input=json.dumps(dict(binding=BINDING,frames=self.frames,loseSqlAt=self.lose_sql_at,uncertainCommit=uncertain,finishAfter=self.finish_after,finalOutcome=self.final_outcome,reconcileAfter=self.reconcile_after,expectedTrack=PENDING['expectedTrack'],otherTracks=PENDING['otherTracksBefore'],snapshots=[PENDING['expectedTrack'],{'z':[None,True,False,1,-1,9007199254740991,'é\u2028✈️\n'], 'a':{}}])),text=True,capture_output=True,check=True)
        self.last=json.loads(result.stdout); return self.last
    def exchange(self, frame):
        self.frames.append(frame); result=self.run()
        if self.lose_reply: raise TimeoutError('private fixture diagnostic')
        return result['responses'][-1]

def setup(f=None,binding=None):
    f=f or Fixture(); backend=ReceiptBackend(JournalTransport(f.exchange,binding or BINDING))
    return f,backend,DurableJournal(backend,BINDING['package'],(binding or BINDING)['owner'])
def rejects(call):
    try:call()
    except RuntimeError:return
    raise AssertionError('Unsafe operation accepted')

f,b,j=setup();j.reserve(BASE);j.persist(OPEN);j.persist(PENDING)
assert f.last['snapshotDigests']==[snapshot_digest(PENDING['expectedTrack']),snapshot_digest({'z':[None,True,False,1,-1,9007199254740991,'é\u2028✈️\n'], 'a':{}})]
assert f.last['record']['intent']['expectedTrackSha256']==f.last['snapshotDigests'][0]
assert b.revision==3 and b.read(BINDING['package'])==dict(PENDING,journalOwner=BINDING['owner'])
unknown=dict(PENDING,state='unknown',errorType='TimeoutError');j.persist(unknown)
assert f.last['record']['state']=='reconciliation_required' and b.read(BINDING['package'])==dict(unknown,journalOwner=BINDING['owner'])
count=len(f.frames);rejects(lambda:j.reserve(BASE));rejects(lambda:j.persist(PENDING));assert len(f.frames)==count
# Foreign owners/new instances cannot reclaim the durable package key.
f2,b2,j2=setup(f,dict(BINDING,owner='new-run'));rejects(lambda:j2.reserve(BASE));assert f.last['record']['owner']==BINDING['owner']
# SQL commit actually persists pending but its reply is lost: no further exchange.
f,b,j=setup();j.reserve(BASE);j.persist(OPEN);f.lose_sql_at=len(f.frames);rejects(lambda:j.persist(PENDING));assert f.last['record']['state']=='pending'
count=len(f.frames);rejects(lambda:j.persist(PENDING));rejects(lambda:b.read(BINDING['package']));assert len(f.frames)==count
# Transport reply lost after successful reservation cannot be reconstructed locally.
f,b,j=setup();f.lose_reply=True;rejects(lambda:j.reserve(BASE));assert f.last['record']['state']=='reserved';count=len(f.frames);rejects(lambda:j.reserve(BASE));assert len(f.frames)==count
# Trusted existing in-process helper simulates uncertain store commit exactly once.
f,b,j=setup();j.reserve(BASE);j.persist(OPEN);result=f.run(uncertain=True);assert result['commitCalls']==1 and result['record']['state']=='reconciliation_required'
# Frame replay / stale revision / foreign owner are rejected by the actual protocol.
frames=copy.deepcopy(f.frames);f.frames.append(frames[0]);assert json.loads(f.run()['responses'][-1])['status']=='blocked'
for change in ({'revision':99},{'binding':dict(BINDING,owner='foreign')}):
 frame=json.loads(frames[-1]);frame.update(change);frame['id']='negative';f.frames=frames+[json.dumps(frame,sort_keys=True,separators=(',',':'))];assert json.loads(f.run()['responses'][-1])['status']=='blocked'
# Caller-authored positive outcomes are not trusted and cannot use the wire.
for state in ('acknowledged','reconciled'):
 f,b,j=setup();j.reserve(BASE);j.persist(OPEN);j.persist(PENDING);count=len(f.frames);rejects(lambda:j.persist(dict(PENDING,state=state,committed=True,acknowledged=True)));assert len(f.frames)==count
print('PASS: DurableJournal Python receipt mapping through actual Node protocol/journal; SQL/transport reply loss, replay, owner/revision and uncertain helper commit retain reservation; fictional SQL only')

for invalid in (1.0, float('nan'), 9007199254740992, {'é':1}, '\ud800'):
    try:snapshot_digest(invalid)
    except (ValueError,UnicodeError):pass
    else:raise AssertionError('Incompatible snapshot type accepted')

# Future source-only and fixture-only edits must schedule this offline suite.
import ast
import fnmatch
workflow = Path(__file__).resolve().parents[2] / '.github/workflows/mobile-play-preflight.yml'
text = workflow.read_text()
marker = '  pull_request:\n    paths:\n'
assert text.count(marker) == 1
section = text.split(marker)[1].split('\n\n', 1)[0]
patterns = []
for line in section.splitlines():
    assert line.startswith('      - '), 'Unexpected path-filter syntax; update contract test'
    patterns.append(ast.literal_eval(line[len('      - '):]))
for name in ('receipt_backend.py', 'test_receipt_backend.py', 'test_receipt_backend.mjs', 'mysql_journal_fixture.mjs'):
    changed = 'scripts/android-play/' + name
    assert any(fnmatch.fnmatchcase(changed, pattern) for pattern in patterns), 'Source-only edit would skip receipt CI: ' + changed
assert not any(fnmatch.fnmatchcase('docs/unrelated.md', pattern) for pattern in patterns)
offline = text.split('  offline-guards:\n')[1].split('  inspect-existing-play-access:\n')[0]
assert 'run: python3 scripts/android-play/test_journal_transport.py' in offline
assert 'import test_receipt_backend' in Path(__file__).with_name('test_journal_transport.py').read_text()
print('PASS: each receipt backend/test/SQL fixture source-only PR path triggers the existing offline suite; unrelated documentation does not')


# Trusted Node helpers persist final outcomes; Python only reads/proves them.
def finalized(outcome):
    f,b,j=setup();j.reserve(BASE);j.persist(OPEN)
    f.finish_after=len(f.frames)-1;f.final_outcome=outcome
    completed=f.run()
    return f,b,j,copy.deepcopy(completed['finalResult']),copy.deepcopy(completed['observation'])

def project(b,result,observation=None,expected=None,other=None):
    return b.project_verified_result(result,expected if expected is not None else PENDING['expectedTrack'],other if other is not None else PENDING['otherTracksBefore'],observation)

for outcome in ('acknowledged','reconciled','uncertain'):
    f,b,j,result,observation=finalized(outcome)
    count=len(f.frames);receipt=project(b,result,observation)
    assert [json.loads(frame)['operation'] for frame in f.frames[count:]]==['read']
    assert receipt['storeAvailability']=='unknown' and receipt['retryAllowed'] is False and receipt['rolloverAllowed'] is False
    assert receipt['state']==('reconciliation_required' if outcome=='uncertain' else outcome)
    assert receipt['committed']==(None if outcome=='uncertain' else True)
    assert receipt['acknowledged']==(outcome!='uncertain') and receipt['verified']==(outcome=='reconciled')
    assert b.read(BINDING['package'])==receipt and f.last['finalCommitCalls']==1
    count=len(f.frames);rejects(lambda:project(b,result,observation));rejects(lambda:j.reserve(BASE));assert len(f.frames)==count
    assert f.last['record']['owner']==BINDING['owner'] and f.last['record']['state']==receipt['state']

# Plausible forged final claim while actual Node row is still edit_open.
f,b,j=setup();j.reserve(BASE);j.persist(OPEN)
forged=dict(package=BINDING['package'],owner=BINDING['owner'],revision=4,state='acknowledged',intent=dict(b.intent,track='qa',expectedTrackSha256=snapshot_digest(PENDING['expectedTrack']),otherTracksBeforeSha256=snapshot_digest({})),retryAllowed=False,storeAvailability='unknown')
rejects(lambda:project(b,forged));assert f.last['record']['state']=='edit_open'
count=len(f.frames);rejects(lambda:project(b,forged));assert len(f.frames)==count

for mutate in (lambda r:r.update(revision=3), lambda r:r.update(owner='foreign'),lambda r:r['intent'].update(artifactSha256='f'*64),lambda r:r['intent'].update(expectedTrackSha256='f'*64),lambda r:r.update(retryAllowed=True)):
    f,b,j,result,observation=finalized('acknowledged');mutate(result);count=len(f.frames)
    rejects(lambda:project(b,result));assert len(f.frames)==count

# Proof drift/missing proof and snapshot drift cannot grant verified status.
for change in ('snapshot','proof','missing','availability'):
    f,b,j,result,observation=finalized('reconciled');count=len(f.frames)
    expected=copy.deepcopy(PENDING['expectedTrack'])
    if change=='snapshot':expected['releases'][0]['name']='forged'
    if change=='proof':observation['pendingReview']=True
    if change=='missing':result['intent'].pop('reconciliationSha256')
    if change=='availability':result['storeAvailability']='available'
    rejects(lambda:project(b,result,observation,expected));assert len(f.frames)==count

# Real final write in fictional SQL, but read response disappears: no projection/retry.
f,b,j,result,observation=finalized('reconciled');previous=copy.deepcopy(b.value);f.lose_reply=True
rejects(lambda:project(b,result,observation));assert b.value==previous and f.last['record']['state']=='reconciled'
count=len(f.frames);rejects(lambda:project(b,result,observation));rejects(lambda:j.reserve(BASE));assert len(f.frames)==count
print('PASS: final Node helper results imported only after exact owned readback and snapshot/proof checks; forged/stale/drift/lost replies blocked; no final writes, release or retry; fictional SQL only')


# Read an acknowledged result, then the trusted helper's next reconciled revision.
f,b,j,result,observation=finalized('acknowledged');ack=project(b,result)
assert ack['acknowledged'] is True and ack['verified'] is False
f.reconcile_after=len(f.frames)-1
completed=f.run();result=copy.deepcopy(completed['finalResult']);observation=copy.deepcopy(completed['observation'])
count=len(f.frames);final=project(b,result,observation)
assert final['verified'] is True and b.revision==5
assert [json.loads(frame)['operation'] for frame in f.frames[count:]]==['read']
assert b.read(BINDING['package'])==final
count=len(f.frames);rejects(lambda:project(b,result,observation));rejects(lambda:j.reserve(BASE));assert len(f.frames)==count
print('PASS: acknowledged-to-reconciled helper progression imports only next verified revision; terminal projection remains locked; fictional SQL only')
