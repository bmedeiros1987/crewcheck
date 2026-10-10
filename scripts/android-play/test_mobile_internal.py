"""Offline policy and fake-API checks; no Google/GitHub network or credentials."""
import copy
import json
import os
from pathlib import Path
import tempfile
from unittest.mock import patch
import mobile_internal as m


def rejects(call):
    try:
        call()
    except (AssertionError, ValueError):
        return
    raise AssertionError('Unsafe input was accepted')

for track in ['production', 'wear:qa', 'beta']:
    rejects(lambda: m.select_track([{'track': track, 'releases': []}]))
rejects(lambda: m.select_track([{'track': t, 'releases': []} for t in m.ALIASES]))
for status in ['draft', 'inProgress', 'halted']:
    rejects(lambda: m.select_track([{'track': 'qa', 'releases': [{'status': status}]}]))
track = {'track': 'internal', 'releases': [{'status': 'completed', 'versionCodes': ['144150', '144151']} ]}
payload = m.retained_release(track, 144155, '14.4.11')
assert payload['releases'][0]['versionCodes'] == ['144150', '144151', '144155']
rejects(lambda: m.retained_release(track, 144150, '14.4.11'))
assert m.next_version_code([144151,144154,144158],144101) == (144158,144159)

runs = [dict(id=i+1, workflow_id=i+1, head_sha=m.SOURCE_SHA, event='pull_request', name=n, status='completed', conclusion='success') for i,n in enumerate(sorted(m.REQUIRED_CI))]
m.check_ci_runs(runs)
for override in [{'head_sha':'0'*40}, {'status':'in_progress','conclusion':None}, {'conclusion':'failure'}]:
    bad=copy.deepcopy(runs);bad[0].update(override);rejects(lambda:m.check_ci_runs(bad))
rejects(lambda:m.check_ci_runs(runs[:1]))
with patch.dict(os.environ, {'GITHUB_REF':'refs/heads/main','GITHUB_EVENT_NAME':'push'}), patch.object(m,'run',return_value=m.SOURCE_SHA):
    rejects(m.guard)
with patch.dict(os.environ, {'GITHUB_REF':'refs/heads/topic','GITHUB_EVENT_NAME':'workflow_dispatch'}), patch.object(m,'run',return_value=m.SOURCE_SHA):
    rejects(m.guard)
with patch.dict(os.environ, {'GITHUB_REF':'refs/heads/main','GITHUB_EVENT_NAME':'workflow_dispatch'}), patch.object(m,'run',return_value='0'*40):
    rejects(m.guard)

# Allocation changes only phone version and shared package floor, never Wear/face.
original=json.loads(Path(__file__).with_name('release-policy.json').read_text())
with tempfile.TemporaryDirectory() as temp:
    path=Path(temp)/'policy.json';path.write_text(json.dumps(original));calls=[]
    def fake_api(session, method, url, **kwargs):
        calls.append((method,url));return {'id':'test-edit'} if method=='POST' else {}
    tracks=[track,{'track':'production','releases':[{'status':'completed','versionCodes':['144154']}]}]
    with patch.object(m,'guard'),patch.object(m,'POLICY',path),patch.object(m,'play_session',return_value=object()),patch.object(m,'api',side_effect=fake_api),patch.object(m,'collect_live_codes',return_value=(tracks,[144150,144151,144154])):
        m.allocate_offline_contract()
    result=json.loads(path.read_text())
    assert result['artifacts']['app']['versionCode']==144155
    for key in ['wear','watchface']:assert result['artifacts'][key]==original['artifacts'][key]
    assert calls[-1][0]=='DELETE'
    assert not any(method=='PUT' or 'watch.app' in url for method,url in calls)

workflow=Path(__file__).parents[2]/'.github/workflows/mobile-only-internal.yml'
source=workflow.read_text()
assert ':app:bundleRelease' in source and ':wear:' not in source and ':watchface:' not in source
assert 'default: false' in source and "if: inputs.publish_mobile_internal == true" in source
assert m.SOURCE_SHA in source and 'persist-credentials: false' in source
print('PASS: mobile-only guards, exact-source CI, live allocation, retained codes; zero APIs')

# Exercise the complete publish controller against a fake Play API.
import hashlib

def simulated_publish(failure=None):
    with tempfile.TemporaryDirectory() as temp:
        root=Path(temp);data=b'synthetic AAB bytes; no real signing material';(root/'app.aab').write_bytes(data)
        policy=copy.deepcopy(original);policy['knownMaxVersionCode'][m.PACKAGE]=144154;policy['artifacts']['app']['versionCode']=144155
        spec=policy['artifacts']['app']
        evidence=dict(module='app',sourceSha=m.SOURCE_SHA,file='app.aab',sha256=hashlib.sha256(data).hexdigest(),certificateSha256=policy['uploadCertificateSha256'],versionName=policy['versionName'],**spec)
        if failure=='hash':evidence['sha256']='0'*64
        if failure=='wrong-source':evidence['sourceSha']='0'*40
        (root/'mobile-release.json').write_text(json.dumps(evidence));(root/'resolved-release-policy.json').write_text(json.dumps(policy))
        original_tracks=[copy.deepcopy(track),{'track':'wear:qa','releases':[{'status':'completed','versionCodes':['144153']}]},{'track':'production','releases':[{'status':'completed','versionCodes':['144154']}]}]
        state={'tracks':copy.deepcopy(original_tracks),'live':copy.deepcopy(original_tracks),'calls':[],'committed':False,'edit_count':0}
        if failure=='prior-intent':(root/'mobile-commit-receipt.json').write_text('{}')
        def fake(session,method,url,**kwargs):
            state['calls'].append((method,url,kwargs))
            if method=='POST' and url.endswith('/edits'):
                state['edit_count']+=1
                assert state['edit_count']==1 or state['committed'],'New edit would invalidate unresolved original'
                if failure=='verify-unavailable' and state['edit_count']>1:raise TimeoutError('offline fake')
                return {'id':'release' if state['edit_count']==1 else 'verify'}
            if method=='POST' and 'uploadType=media' in url:return {'versionCode':144155}
            if method=='PUT':
                assert '/tracks/internal' in url
                state['tracks'][0]=copy.deepcopy(kwargs['json'])
                if failure=='other-track':state['tracks'][1]['releases']=[]
                if failure=='retention':state['tracks'][0]['releases'][0]['versionCodes']=['144155']
                return kwargs['json']
            if method=='GET' and url.endswith('/releases'):
                if failure=='uncertain-read-unavailable':raise TimeoutError('offline reconciliation read unavailable')
                return {'releases':copy.deepcopy(state['live'][0]['releases'])}
            if method=='GET' and url.endswith('/tracks'):
                snapshot=copy.deepcopy(state['live'] if '/verify/' in url else state['tracks'])
                if failure=='postcommit-drift' and state['committed']:snapshot[1]['releases']=[]
                return {'tracks':snapshot}
            if method=='POST' and url.endswith(':commit'):
                assert kwargs=={'params':{'changesNotSentForReview':'true','changesInReviewBehavior':'ERROR_IF_IN_REVIEW'}}
                pending=json.loads((root/'mobile-commit-receipt.json').read_text())
                assert pending['state']=='pending' and pending['committed'] is None and pending['verified'] is False
                assert pending['editId']=='release' and pending['sha256']==evidence['sha256']
                if failure=='review-mode':raise RuntimeError('CHANGES_ALREADY_IN_REVIEW')
                if failure in ('timeout-uncommitted','uncertain-read-unavailable'):raise TimeoutError('offline timeout before commit')
                state['committed']=True;state['live']=copy.deepcopy(state['tracks'])
                if failure=='runner-crash':raise SystemExit('simulated runner loss after remote commit')
                if failure=='timeout-committed':raise TimeoutError('offline lost commit response')
                return {}
            if method=='DELETE':return {}
            raise AssertionError('Unexpected API operation')
        codes=[144150,144151,144153,144154]+([144155] if failure=='version-race' else [])
        try:
            from receipt_journal import DurableJournal
            class Backend:
                value = None
                def create_if_absent(self, key, value):
                    assert self.value is None
                    self.value = copy.deepcopy(value)
                def replace_owned(self, key, owner, value):
                    assert self.value['journalOwner'] == owner
                    self.value = copy.deepcopy(value)
                def read(self, key): return copy.deepcopy(self.value)
            backend = Backend()
            journal = DurableJournal(backend, m.PACKAGE, 'offline-run')
            with patch.dict(os.environ,{'PUBLISH_MOBILE_INTERNAL':'false' if failure=='no-opt-in' else 'true'}),patch.object(m,'guard'),patch.object(m,'check_ci'),patch.object(m,'play_session',return_value=object()),patch.object(m,'api',side_effect=fake),patch.object(m,'collect_live_codes',return_value=(copy.deepcopy(original_tracks),codes)):
                m.publish(root, journal=journal)
        except SystemExit:
            assert failure == 'runner-crash' and state['committed']
            assert backend.value['state'] == 'pending' and backend.value['editId'] == 'release'
            assert not any(method=='DELETE' and url.endswith('/release') for method,url,_ in state['calls'])
            fresh = DurableJournal(backend, m.PACKAGE, 'replacement-run')
            rejects(lambda: fresh.reserve({'versionCode': 144156}))
            assert not (root/'mobile-internal-result.json').exists()
            return
        except (AssertionError,RuntimeError):
            assert failure
            assert state['committed'] == (failure in ('postcommit-drift','verify-unavailable','timeout-committed'))
            attempts=[call for call in state['calls'] if call[0]=='POST' and call[1].endswith(':commit')]
            assert len(attempts)<=1,'Never retry commit or change review mode'
            if attempts:
                receipt=json.loads((root/'mobile-commit-receipt.json').read_text())
                assert receipt['verified'] is False and receipt['state']=='reconciliation_required'
                assert receipt['committed'] == (True if failure in ('postcommit-drift','verify-unavailable') else None)
                if failure in ('postcommit-drift','verify-unavailable'):
                    assert state['edit_count']==2
                else:
                    assert state['edit_count']==1,'Uncertain commit must not replace original edit'
                    assert len(receipt['releaseSummaries'])==len(original_tracks)
                    after=state['calls'][state['calls'].index(attempts[0])+1:]
                    assert all(method=='GET' and url.endswith('/releases') for method,url,_ in after),'Only non-mutating reconciliation after uncertain commit'
                assert not any(method=='DELETE' and url.endswith('/release') for method,url,_ in state['calls'])
            assert not (root/'mobile-internal-result.json').exists()
            if failure=='prior-intent':assert not state['calls'],'Existing intent prevents blind retry before API access'
            return
        assert failure is None,'Unsafe publish unexpectedly passed'
        result=json.loads((root/'mobile-internal-result.json').read_text())
        receipt=json.loads((root/'mobile-commit-receipt.json').read_text())
        assert receipt['state']=='reconciled' and receipt['verified'] is True and receipt['committed'] is True
        assert result['commitAcknowledged'] == (failure is None)
        assert result['retainedVersionCodes']==['144150','144151','144155']
        assert m.other_tracks(state['live'],'internal')==m.other_tracks(original_tracks,'internal')
        assert sum(method=='POST' and url.endswith(':commit') for method,url,_ in state['calls'])==1
        assert not any(method=='DELETE' and url.endswith('/release') for method,url,_ in state['calls'])

simulated_publish()
for failure in ['hash','wrong-source','version-race','other-track','retention','review-mode','no-opt-in','postcommit-drift','timeout-committed','timeout-uncommitted','verify-unavailable','uncertain-read-unavailable','prior-intent','runner-crash']:
    simulated_publish(failure)
print('PASS: fake publication guards existing reviews, persists intent before commit, reconciles lost responses and blocks blind retry/cleanup; zero APIs')
with patch.dict(os.environ, {'PUBLISH_MOBILE_INTERNAL':'true'}), patch.object(m,'guard'), patch.object(m,'play_session') as session:
    rejects(lambda: m.publish('/unused'))
    session.assert_not_called()
with patch.object(m,'play_session') as session:
    rejects(m.allocate)
    session.assert_not_called()
