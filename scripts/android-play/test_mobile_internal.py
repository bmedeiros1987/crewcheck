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
        m.allocate()
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
        state={'tracks':copy.deepcopy(original_tracks),'calls':[],'committed':False}
        def fake(session,method,url,**kwargs):
            state['calls'].append((method,url,kwargs))
            if method=='POST' and url.endswith('/edits'):return {'id':'verify' if state['committed'] else 'release'}
            if method=='POST' and 'uploadType=media' in url:return {'versionCode':144155}
            if method=='PUT':
                assert '/tracks/internal' in url
                state['tracks'][0]=copy.deepcopy(kwargs['json'])
                if failure=='other-track':state['tracks'][1]['releases']=[]
                if failure=='retention':state['tracks'][0]['releases'][0]['versionCodes']=['144155']
                return kwargs['json']
            if method=='GET' and url.endswith('/tracks'):
                snapshot=copy.deepcopy(state['tracks'])
                if failure=='postcommit-drift' and state['committed']:snapshot[1]['releases']=[]
                return {'tracks':snapshot}
            if method=='POST' and url.endswith(':commit'):
                assert kwargs=={'params':{'changesNotSentForReview':'true'}}
                if failure=='review-mode':raise RuntimeError('changesNotSentForReview must not be set')
                state['committed']=True;return {}
            if method=='DELETE':return {}
            raise AssertionError('Unexpected API operation')
        codes=[144150,144151,144153,144154]+([144155] if failure=='version-race' else [])
        try:
            with patch.dict(os.environ,{'PUBLISH_MOBILE_INTERNAL':'false' if failure=='no-opt-in' else 'true'}),patch.object(m,'guard'),patch.object(m,'check_ci'),patch.object(m,'play_session',return_value=object()),patch.object(m,'api',side_effect=fake),patch.object(m,'collect_live_codes',return_value=(copy.deepcopy(original_tracks),codes)):
                m.publish(root)
        except (AssertionError,RuntimeError):
            assert failure
            assert state['committed'] == (failure=='postcommit-drift')
            if state['committed']:
                assert json.loads((root/'mobile-commit-receipt.json').read_text())['verified'] is False
                assert not any(method=='DELETE' and url.endswith('/release') for method,url,_ in state['calls'])
            assert not (root/'mobile-internal-result.json').exists()
            if state['calls']:assert state['calls'][-1][0]=='DELETE'
            return
        assert failure is None,'Unsafe publish unexpectedly passed'
        result=json.loads((root/'mobile-internal-result.json').read_text())
        assert result['retainedVersionCodes']==['144150','144151','144155']
        assert m.other_tracks(state['tracks'],'internal')==m.other_tracks(original_tracks,'internal')
        assert sum(method=='POST' and url.endswith(':commit') for method,url,_ in state['calls'])==1

simulated_publish()
for failure in ['hash','wrong-source','version-race','other-track','retention','review-mode','no-opt-in','postcommit-drift']:
    simulated_publish(failure)
print('PASS: fake publication retains mobile packages, leaves Wear/production untouched, rejects races/tampering/review fallback; zero APIs')
