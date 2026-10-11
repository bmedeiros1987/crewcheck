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
            assert operation in {'read', 'reserve', 'advance'}
            assert type(revision) is int and revision >= 0
            assert isinstance(intent, dict)
            if operation == 'advance': assert revision > 0 and state in {'edit_open', 'pending', 'reconciliation_required'}
            else: assert state is None
            if operation == 'reserve': assert revision == 0
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
            assert set(result) == {'schema', 'id', 'status', 'record', 'retryAllowed', 'storeAvailability'}
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
                expected = revision if operation == 'read' else revision + 1
                assert record['revision'] == expected
                expected_state = None if operation == 'read' else ('reserved' if operation == 'reserve' else state)
                if expected_state: assert record['state'] == expected_state
                for field in ('sourceSha', 'controllerSha', 'runId', 'artifactSha256', 'versionCode'):
                    assert record['intent'][field] == self.binding[field]
                if operation != 'read': assert record['intent'] == intent
            return copy.deepcopy(record)
        except Exception:
            self.blocked = True
            raise RuntimeError('Journal transport unverified; no retry or store action') from None
