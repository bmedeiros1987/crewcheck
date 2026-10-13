"""Actual publisher -> receipt/transport -> Node helpers -> fictional SQL/Play.

Prefix replay models durable rows, not a live bridge. All store calls below are
fictional and the production controller/allocator remain disabled.
"""
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
from unittest.mock import patch
os.environ['REVIEWED_SOURCE_SHA'] = 'a' * 40
import mobile_internal as m
from receipt_journal import DurableJournal
from receipt_backend import ReceiptBackend
from journal_transport import JournalTransport

POLICY = json.loads(Path(__file__).with_name('release-policy.json').read_text())
TRACKS = [{'track': 'internal', 'releases': [{'status': 'completed', 'versionCodes': ['144150', '144151']}]},
          {'track': 'wear:qa', 'releases': [{'status': 'completed', 'versionCodes': ['144153']}]},
          {'track': 'production', 'releases': [{'status': 'completed', 'versionCodes': ['144154']}]}]

class ExecutorFixture:
    def __init__(self, binding, state, scenario):
        self.binding, self.state, self.scenario = binding, state, scenario
        self.frames, self.last = [], None
    def run(self, contender=None):
        target = copy.deepcopy(self.state['tracks'][0])
        final_other = copy.deepcopy(m.other_tracks(self.state['tracks'], 'internal'))
        if self.scenario == 'final-drift': final_other['wear:qa']['releases'] = []
        data = dict(binding=self.binding, frames=self.frames, scenario=self.scenario, stagedTrack=target,
                    otherTracks=copy.deepcopy(m.other_tracks(self.state['tracks'], 'internal')), finalTrack=target,
                    finalOtherTracks=final_other, contender=contender)
        result = subprocess.run(['node', str(Path(__file__).with_suffix('.mjs'))], input=json.dumps(data),
                                text=True, capture_output=True, check=True, timeout=30)
        self.last = json.loads(result.stdout)
        return self.last
    def exchange(self, frame):
        self.frames.append(frame)
        result = self.run()
        operation = json.loads(frame)['operation']
        if operation == 'commit' and self.scenario == 'runner-dead':
            # The real child-death/InnoDB case lives in test_mysql_journal_isolated.
            raise SystemExit('fictional publisher runner lost after helper execution')
        if operation == 'commit' and self.scenario == 'lost-transport':
            raise TimeoutError('fictional reply lost after durable helper execution')
        return result['responses'][-1]

def exercise(scenario=None):
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp); data = b'fictional phone AAB; no signing material'
        (root/'app.aab').write_bytes(data)
        policy = copy.deepcopy(POLICY)
        policy['knownMaxVersionCode'][m.PACKAGE] = 144154
        policy['artifacts']['app']['versionCode'] = 144155
        evidence = dict(module='app', sourceSha=m.SOURCE_SHA, file='app.aab', sha256=hashlib.sha256(data).hexdigest(),
                        certificateSha256=policy['uploadCertificateSha256'], versionName=policy['versionName'],
                        playSubmissionAllowed=True, **policy['artifacts']['app'])
        if scenario == 'unallocated': evidence['playSubmissionAllowed'] = False
        if scenario == 'artifact-drift': evidence['sha256'] = '0'*64
        (root/'mobile-release.json').write_text(json.dumps(evidence))
        (root/'resolved-release-policy.json').write_text(json.dumps(policy))
        state = dict(tracks=copy.deepcopy(TRACKS), calls=[])
        binding = dict(package=m.PACKAGE, owner='mobile:123:1', producer='mobile', sourceSha=m.SOURCE_SHA,
                       controllerSha='b'*40, runId='123', artifactSha256=evidence['sha256'], versionCode=144155)
        fixture = ExecutorFixture(binding, state, scenario)
        backend = ReceiptBackend(JournalTransport(fixture.exchange, binding))
        journal = DurableJournal(backend, m.PACKAGE, binding['owner'])
        def api(_session, method, url, **kwargs):
            state['calls'].append((method, url))
            # Store commit and final verification belong to the Node helpers.
            assert not url.endswith(':commit'), 'Python cannot commit on the trusted lifecycle path'
            if method == 'POST' and url.endswith('/edits'):
                assert sum(x[0] == 'POST' and x[1].endswith('/edits') for x in state['calls']) == 1
                return {'id': 'original-edit'}
            if method == 'POST' and 'uploadType=media' in url: return {'versionCode': 144155}
            if method == 'PUT':
                state['tracks'][0] = copy.deepcopy(kwargs['json']); return kwargs['json']
            if method == 'GET' and url.endswith('/tracks'): return {'tracks': copy.deepcopy(state['tracks'])}
            if method == 'DELETE': return {}
            raise AssertionError('Unexpected fictional API call')
        codes = [144150,144151,144153,144154] + ([144160] if scenario == 'wear-version-race' else [])
        failure = None
        try:
            with patch.dict(os.environ, {'PUBLISH_MOBILE_INTERNAL': 'true'}), patch.object(m, 'guard'), patch.object(m, 'check_ci'), \
                 patch.object(m, 'play_session', return_value=object()), patch.object(m, 'api', side_effect=api), \
                 patch.object(m, 'collect_live_codes', return_value=(copy.deepcopy(TRACKS), codes)):
                m.publish(root, journal=journal)
        except (AssertionError, RuntimeError, SystemExit) as error:
            failure = error
        if scenario is None:
            assert failure is None
            result = json.loads((root/'mobile-internal-result.json').read_text())
            assert result['retainedVersionCodes'] == ['144150','144151','144155']
            assert result['storeAvailability'] == 'unknown' and result['commitAcknowledged'] is True
            assert fixture.last['record']['state'] == 'reconciled'
            assert fixture.last['commits'] == 1 and fixture.last['completeReads'] == 1
            assert journal.backend.read(m.PACKAGE)['verified'] is True
        else:
            assert failure is not None, scenario
            assert not (root/'mobile-internal-result.json').exists()
            if scenario in ('unallocated', 'artifact-drift'): assert not state['calls'] and not fixture.frames
            if scenario == 'wear-version-race': assert fixture.last['record']['state'] == 'edit_open' and fixture.last['commits'] == 0
            if scenario in ('no-capability', 'lost-pending-sql', 'incomplete-stage', 'pending-review'): assert fixture.last['commits'] == 0
            if scenario == 'lost-pending-sql': assert fixture.last['record']['state'] == 'pending'
            if scenario in ('uncertain-commit', 'incomplete-stage', 'pending-review'): assert fixture.last['record']['state'] == 'reconciliation_required'
            if scenario in ('incomplete-final', 'reader-unavailable', 'final-drift', 'lost-final-sql', 'lost-transport', 'runner-dead'):
                assert fixture.last['record']['state'] == 'acknowledged' and fixture.last['commits'] == 1, (scenario, fixture.last['record'], fixture.last['commits'], str(failure))
            if scenario not in ('unallocated', 'artifact-drift', 'wear-version-race'):
                assert not any(method == 'DELETE' for method, _ in state['calls']), 'Uncertainty cannot clean up the original edit'
                assert len([frame for frame in fixture.frames if json.loads(frame)['operation'] == 'commit']) == 1
        if fixture.last and fixture.last['record']:
            # Fresh Mobile/Wear runs cannot reclaim any reserved/final state.
            contender = dict(binding, owner='wear:124:1', producer='wear', runId='124', versionCode=144156)
            assert fixture.run(contender)['contenderBlocked'] is True
            assert fixture.last['commits'] <= 1
        if scenario is None:
            original_commit = next(frame for frame in fixture.frames if json.loads(frame)['operation'] == 'commit')
            fixture.frames.append(original_commit)
            assert json.loads(fixture.run()['responses'][-1])['status'] == 'blocked'
            assert fixture.last['commits'] == 1
            replay = json.loads(original_commit); replay['id'] = 'new_stale_commit'
            fixture.frames[-1] = json.dumps(replay, sort_keys=True, separators=(',', ':'))
            assert json.loads(fixture.run()['responses'][-1])['status'] == 'blocked'
            assert fixture.last['commits'] == 1
        return fixture

exercise()
for scenario in ('no-capability','lost-pending-sql','incomplete-stage','pending-review','uncertain-commit','lost-final-sql',
                 'incomplete-final','reader-unavailable','final-drift','lost-transport','runner-dead','unallocated',
                 'artifact-drift','wear-version-race'):
    exercise(scenario)
print('PASS actual mobile publisher through existing Python/Node receipt/protocol/helpers: commit once, full proof, lost SQL/transport/Play replies, stopped runner model, Mobile/Wear fencing and version race; all fictional, controller OFF')
