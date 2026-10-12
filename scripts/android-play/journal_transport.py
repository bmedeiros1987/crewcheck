"""Injected serialized transport only; never starts Node, loads secrets or connects."""
import copy
import json
import re


class JournalTransport:
    def __init__(self, exchange, binding):
        assert callable(exchange), 'Explicit reviewed transport required'
        assert isinstance(binding, dict) and set(binding) == {'package', 'owner', 'producer', 'sourceSha', 'controllerSha', 'runId', 'artifactSha256', 'versionCode'}
        assert binding['package'] == 'com.crewcheck.app' and binding['producer'] in {'mobile', 'wear', 'allocator'}
        assert isinstance(binding['owner'], str) and re.fullmatch('[A-Za-z0-9:_-]{1,128}', binding['owner'])
        for field in ('sourceSha', 'controllerSha'): assert isinstance(binding[field], str) and re.fullmatch('[0-9a-f]{40}', binding[field])
        assert isinstance(binding['artifactSha256'], str) and re.fullmatch('[0-9a-f]{64}', binding['artifactSha256'])
        assert isinstance(binding['runId'], str) and re.fullmatch('[1-9][0-9]*', binding['runId'])
        assert type(binding['versionCode']) is int and 0 < binding['versionCode'] < 2100000000
        self.exchange, self.binding = exchange, copy.deepcopy(binding)
        self.sequence = 0
        self.blocked = False

    def request(self, operation, intent, revision=0, state=None):
        assert not self.blocked, 'Uncertain or blocked transport cannot retry'
        self.sequence += 1
        request_id = 'request_' + str(self.sequence)
        frame = dict(schema=1, id=request_id, operation=operation, binding=self.binding,
                     revision=revision, state=state, intent=copy.deepcopy(intent))
        try:
            assert operation in {'read', 'reserve', 'advance', 'commit', 'reconcile'}
            helper = operation in {'commit', 'reconcile'}
            assert type(revision) is int and revision >= 0
            assert isinstance(intent, dict)
            if operation == 'advance': assert revision > 0 and state in {'edit_open', 'pending', 'reconciliation_required'}
            else: assert state is None
            if operation == 'reserve': assert revision == 0
            if helper: assert revision > 0 and self.binding['producer'] == 'mobile'
            for field in ('sourceSha', 'controllerSha', 'runId', 'artifactSha256', 'versionCode'): assert intent[field] == self.binding[field]
            response = self.exchange(json.dumps(frame, sort_keys=True, separators=(',', ':')))
            assert isinstance(response, str) and len(response.encode()) <= 16384
            def unique(pairs):
                result = {}
                for key, value in pairs:
                    assert key not in result, 'Duplicate response key'
                    result[key] = value
                return result
            result = json.loads(response, object_pairs_hook=unique)
            response_fields = {'schema', 'id', 'status', 'record', 'retryAllowed', 'storeAvailability'}
            if helper: response_fields |= {'helperResult', 'observation'}
            assert set(result) == response_fields
            assert type(result['schema']) is int and result['schema'] == 1 and result['id'] == request_id and result['status'] == 'ok'
            assert result['retryAllowed'] is False and result['storeAvailability'] == 'unknown'
            record = result['record']
            if record is None:
                assert operation == 'read' and revision == 0
            else:
                assert isinstance(record, dict) and set(record) == {'package', 'owner', 'revision', 'state', 'intent'}
                assert record['state'] in {'reserved', 'edit_open', 'pending', 'acknowledged', 'reconciliation_required', 'reconciled'}
                assert isinstance(record['intent'], dict)
                assert record['package'] == self.binding['package'] and record['owner'] == self.binding['owner']
                assert type(record['revision']) is int
                expected = revision if operation == 'read' else revision + (2 if operation == 'commit' else 1)
                assert record['revision'] == expected
                expected_state = None if operation == 'read' or helper else ('reserved' if operation == 'reserve' else state)
                if expected_state: assert record['state'] == expected_state
                for field in ('sourceSha', 'controllerSha', 'runId', 'artifactSha256', 'versionCode'):
                    assert record['intent'][field] == self.binding[field]
                if operation != 'read' and not helper: assert record['intent'] == intent
            if helper:
                assert record is not None
                expected_states = {'acknowledged', 'reconciliation_required'} if operation == 'commit' else {'reconciled'}
                assert record['state'] in expected_states
                outcome = result['helperResult']
                assert isinstance(outcome, dict)
                assert {field: outcome[field] for field in ('package', 'owner', 'revision', 'state', 'intent')} == record
                assert outcome['retryAllowed'] is False and outcome['storeAvailability'] == 'unknown'
                if operation == 'commit': assert result['observation'] is None
                else: assert isinstance(result['observation'], dict) and outcome['rolloverAllowed'] is False
                return copy.deepcopy(dict(result=outcome, observation=result['observation']))
            return copy.deepcopy(record)
        except Exception:
            self.blocked = True
            raise RuntimeError('Journal transport unverified; no retry or store action') from None


class PlannedJournalTransport:
    """Schema-v2 on the same injected exchange. No env/FD/connection loader."""
    def __init__(self, exchange, binding):
        from receipt_backend import snapshot_digest
        assert callable(exchange)
        assert set(binding) == {'schema', 'generation', 'plan'} and binding['schema'] == 2
        assert type(binding['generation']) is int and 0 < binding['generation'] < 2**53
        p = binding['plan']
        assert set(p) == {'package', 'owner', 'producer', 'sourceSha', 'controllerSha', 'runId', 'modules', 'planSha256'}
        assert p['package'] == 'com.crewcheck.app'
        assert p['modules'] == {'mobile': ['app'], 'wear': ['wear'], 'joint': ['app', 'wear']}[p['producer']]
        assert re.fullmatch('[A-Za-z0-9:_-]{1,128}', p['owner'])
        for f in ('sourceSha', 'controllerSha'): assert re.fullmatch('[0-9a-f]{40}', p[f])
        assert re.fullmatch('[1-9][0-9]*', p['runId'])
        body = {k: v for k, v in p.items() if k != 'planSha256'}
        assert p['planSha256'] == snapshot_digest(body)
        self.exchange, self.binding, self.sequence, self.blocked = exchange, copy.deepcopy(binding), 0, False
        self.record = None

    def request(self, operation, data, revision=0):
        assert not self.blocked, 'Uncertain transport cannot retry'
        self.sequence += 1
        frame = dict(schema=2, id='plan_' + str(self.sequence), operation=operation,
                     binding=self.binding, revision=revision, input=copy.deepcopy(data))
        try:
            assert operation in {'read', 'reserve', 'startAllocation', 'saveEdit', 'allocate', 'finalize', 'startStage', 'commit', 'reconcile'}
            assert type(revision) is int and revision >= 0
            if operation in ('commit', 'reconcile'): assert self.binding['plan']['producer'] == 'mobile'
            response = self.exchange(json.dumps(frame, sort_keys=True, separators=(',', ':')))
            assert isinstance(response, str) and len(response.encode()) <= 65536
            def unique(pairs):
                d = {}
                for k, v in pairs:
                    assert k not in d
                    d[k] = v
                return d
            result = json.loads(response, object_pairs_hook=unique)
            assert set(result) == {'schema', 'id', 'status', 'record', 'retryAllowed', 'storeAvailability'}
            assert type(result['schema']) is int and result['schema'] == 2 and result['id'] == frame['id']
            assert result['status'] == 'ok' and result['retryAllowed'] is False and result['storeAvailability'] == 'unknown'
            r = result['record']
            if r is None: assert operation == 'read' and revision == 0
            else:
                validate_planned_record(r, self.binding)
                assert r['schema'] == 2 and r['generation'] == self.binding['generation']
                assert r['package'] == self.binding['plan']['package'] and r['owner'] == self.binding['plan']['owner']
                assert r['plan'] == self.binding['plan']
                assert type(r['revision']) is int and r['revision'] == revision + (0 if operation == 'read' else 2 if operation == 'commit' else 1)
                expected = {'reserve': 'planned', 'startAllocation': 'allocation_started', 'saveEdit': 'edit_known', 'allocate': 'allocated', 'finalize': 'finalized', 'startStage': 'stage_started', 'reconcile': 'reconciled'}
                if operation in expected: assert r['state'] == expected[operation]
                if operation == 'commit': assert r['state'] in ('acknowledged', 'reconciliation_required')
                for f in ('retryAllowed', 'storeMutationAllowed', 'resumeAllowed', 'rolloverAllowed'): assert f not in r
            if r and self.record:
                for field in ('plan','history','editId','allocation','artifacts','staged','reconciliationSha256'):
                    if field in self.record: assert r.get(field) == self.record[field]
                if operation == 'read': assert r == self.record
            if r:
                if operation == 'saveEdit': assert r['editId'] == data['editId']
                if operation == 'allocate': assert r['allocation'] == data
                if operation == 'finalize': assert r['artifacts'] == data
                if operation == 'commit': assert r['staged'] == data
            self.record = copy.deepcopy(r)
            return copy.deepcopy(r)
        except Exception:
            self.blocked = True
            raise RuntimeError('Planned transport unverified; preserve reservation, no retry') from None


def validate_planned_record(r, binding):
    """Mirror the pinned schema; response data never creates authority."""
    states = ['planned', 'allocation_started', 'edit_known', 'allocated', 'finalized', 'stage_started', 'pending', 'acknowledged', 'reconciliation_required', 'reconciled']
    assert isinstance(r, dict) and type(r['schema']) is int and r['schema'] == 2
    assert r['plan'] == binding['plan'] and r['owner'] == binding['plan']['owner'] and r['package'] == binding['plan']['package']
    assert type(r['generation']) is int and r['generation'] == binding['generation']
    assert type(r['revision']) is int and 0 < r['revision'] < 2**53 and r['state'] in states
    def sha(v): assert isinstance(v, str) and re.fullmatch('[0-9a-f]{64}', v)
    def code(v): assert type(v) is int and 0 < v < 2100000000
    fields = {'schema','package','owner','generation','revision','state','plan','history'}
    index = states.index(r['state'])
    if r['state'] == 'stage_started':assert r['plan']['producer'] == 'mobile'
    if index >= 2:
        fields.add('editId');assert isinstance(r['editId'], str) and re.fullmatch('[A-Za-z0-9_-]{1,128}', r['editId'])
    if index >= 3:
        fields.add('allocation');a = r['allocation'];assert set(a) == {'inventorySha256','floor','versionCodes'}
        sha(a['inventorySha256']);code(a['floor']);assert set(a['versionCodes']) == set(r['plan']['modules'])
        previous=a['floor']
        for m in r['plan']['modules']:code(a['versionCodes'][m]);assert a['versionCodes'][m] > previous;previous=a['versionCodes'][m]
    if index >= 4:
        fields.add('artifacts');assert isinstance(r['artifacts'], list) and [a['module'] for a in r['artifacts']] == r['plan']['modules']
        for a in r['artifacts']:
            assert set(a) == {'module','package','versionCode','sourceSha','controllerSha','manifestSha256','uploadCertificateSha256','artifactSha256'}
            code(a['versionCode'])
            assert a['package'] == r['package'] and a['versionCode'] == r['allocation']['versionCodes'][a['module']]
            for f in ('sourceSha','controllerSha'):assert a[f] == r['plan'][f]
            for f in ('manifestSha256','uploadCertificateSha256','artifactSha256'):sha(a[f])
    if index >= 6:
        fields.add('staged');assert r['plan']['producer'] == 'mobile'
        assert set(r['staged']) == {'track','expectedTrackSha256','otherTracksBeforeSha256'} and r['staged']['track'] == 'internal'
        for f in ('expectedTrackSha256','otherTracksBeforeSha256'):sha(r['staged'][f])
    if r['state'] == 'reconciled':fields.add('reconciliationSha256');sha(r['reconciliationSha256'])
    assert set(r) == fields
    assert isinstance(r['history'], list) and len(r['history']) == r['generation'] - 1
    revision,high=0,0
    for i,h in enumerate(r['history']):
        assert set(h) == {'generation','revision','owner','planSha256','artifactsSha256','allocationSha256','reconciliationSha256','highWaterVersionCode'}
        assert type(h['generation']) is int and h['generation'] == i+1
        assert type(h['revision']) is int and revision < h['revision'] < r['revision'];revision=h['revision']
        code(h['highWaterVersionCode']);assert h['highWaterVersionCode'] > high;high=h['highWaterVersionCode']
        assert re.fullmatch('[A-Za-z0-9:_-]{1,128}', h['owner'])
        for f in ('planSha256','artifactsSha256','allocationSha256','reconciliationSha256'):sha(h[f])
    if index >= 3:assert r['allocation']['floor'] >= high
