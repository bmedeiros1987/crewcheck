"""Programmatic schema-v2 mobile controller. CLI default stays OFF.

All store and exchange capabilities come from a reviewed embedding executor;
none are loaded from environment, frames, credentials or module paths.
"""
import copy
import hashlib
import json
from pathlib import Path
from journal_transport import PlannedJournalTransport
from receipt_backend import snapshot_digest as digest



class PlannedMobileController:
    def __init__(self, transport, create_edit, read_inventory, stage_release):
        assert isinstance(transport, PlannedJournalTransport)
        assert transport.binding['plan']['producer'] == 'mobile'
        assert all(callable(x) for x in (create_edit, read_inventory, stage_release))
        self.transport = transport
        self.create_edit, self.read_inventory, self.stage_release = create_edit, read_inventory, stage_release
        self.record, self.inventory = None, None

    def step(self, operation, data):
        r = self.transport.request(operation, data, self.record['revision'] if self.record else 0)
        self.record = r
        return copy.deepcopy(r)

    def allocate(self, policy_path):
        assert self.record is None, 'No repeated allocation or implicit resume'
        assert self.step('read', {}) is None, 'Existing reservation requires explicit recovery'
        p = self.transport.binding['plan']
        self.step('reserve', p)
        self.step('startAllocation', {})
        # Durable barrier before the only create; lost response stays locked.
        edit = self.create_edit(copy.deepcopy(self.record))
        self.step('saveEdit', {'editId': edit})
        inventory = self.read_inventory(copy.deepcopy(self.record))
        assert inventory['package'] == p['package'] and inventory['editId'] == edit
        assert inventory['inventoryComplete'] is True
        policy = json.loads(Path(policy_path).read_text())
        floor = max(inventory['maxCode'], policy['knownMaxVersionCode'][p['package']])
        assert type(floor) is int and 0 < floor < 2099999999
        a = dict(inventorySha256=inventory['inventorySha256'], floor=floor, versionCodes={'app': floor + 1})
        self.step('allocate', a)
        self.inventory = copy.deepcopy(inventory)
        policy['knownMaxVersionCode'][p['package']] = floor
        policy['artifacts']['app']['versionCode'] = floor + 1
        Path(policy_path).write_text(json.dumps(policy, indent=2) + '\n')
        return copy.deepcopy(self.record)

    def finalize(self, output):
        assert self.record and self.record['state'] == 'allocated'
        root = Path(output)
        e = json.loads((root / 'mobile-release.json').read_text())
        p = self.record['plan']
        assert e['module'] == 'app' and e['package'] == p['package'] and e['sourceSha'] == p['sourceSha']
        assert e['controllerSha'] == p['controllerSha'] and e['workflowRunId'] == p['runId']
        assert e['versionCode'] == self.record['allocation']['versionCodes']['app']
        path = root / e['file']
        assert path.name == e['file'], 'Artifact must be a local basename'
        data = path.read_bytes()
        assert hashlib.sha256(data).hexdigest() == e['sha256']
        a = dict(module='app', package=p['package'], versionCode=e['versionCode'], sourceSha=p['sourceSha'], controllerSha=p['controllerSha'],
                 manifestSha256=hashlib.sha256((root / 'app-manifest.xml').read_bytes()).hexdigest(),
                 uploadCertificateSha256=e['certificateSha256'], artifactSha256=e['sha256'])
        # Node's independent byte/manifest/signer verifier, not e's flags, decides.
        self.step('finalize', [a])
        return copy.deepcopy(self.record)

    def publish(self, output):
        assert self.record and self.record['state'] == 'finalized' and self.inventory
        assert self.step('read', {})['state'] == 'finalized'
        root = Path(output)
        e = json.loads((root / 'mobile-release.json').read_text())
        artifact = self.record['artifacts'][0]
        assert (root / e['file']).name == e['file']
        data = (root / e['file']).read_bytes()
        assert hashlib.sha256(data).hexdigest() == artifact['artifactSha256'], 'Artifact changed after finalization'
        assert hashlib.sha256((root / 'app-manifest.xml').read_bytes()).hexdigest() == artifact['manifestSha256']
        target = next(t for t in self.inventory['tracks'] if t['track'] == 'internal')
        assert all(r['status'] == 'completed' for r in target['releases'])
        codes = {str(v) for r in target['releases'] for v in r['versionCodes']}
        assert str(artifact['versionCode']) not in codes
        payload = {'track': 'internal', 'releases': [{'status': 'completed', 'versionCodes': sorted(codes | {str(artifact['versionCode'])}, key=int)}]}
        other = {t['track']: t for t in self.inventory['tracks'] if t['track'] != 'internal'}
        staged = dict(track='internal', expectedTrackSha256=digest(payload), otherTracksBeforeSha256=digest(other))
        self.step('startStage', {})
        self.stage_release(copy.deepcopy(self.record), data, copy.deepcopy(payload))
        self.step('commit', staged)
        assert self.record['state'] == 'acknowledged', 'Commit uncertain; no retry or replacement edit'
        self.step('reconcile', {})
        return copy.deepcopy(self.record)
