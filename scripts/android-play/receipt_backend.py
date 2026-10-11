"""OFF receipt projection onto the existing journal; no connection or authority.

Local receipts only cache a projection whose revision/intent is verified by Node.
Caller flags cannot assert acknowledgement/reconciliation; internal helpers own
those outcomes. This is not wired into mobile_internal.publish.
"""
import copy
import hashlib
import json


def snapshot_digest(value):
    # Compatible subset of reconcile_journal.snapshotDigest: sorted ASCII keys,
    # UTF-8 JSON strings and safe integer numbers. Fractions/unsafe integers and
    # non-ASCII keys are rejected rather than silently hashed differently.
    def validate(item):
        if item is None or type(item) is bool:
            return
        if type(item) is int and abs(item) <= 9007199254740991:
            return
        if type(item) is str:
            item.encode('utf-8')  # Reject lone surrogate code points.
            return
        if type(item) is list:
            for child in item: validate(child)
            return
        if type(item) is dict:
            for key, child in item.items():
                if type(key) is not str or not key or any(ord(c) < 32 or ord(c) > 126 for c in key):
                    raise ValueError('Snapshot key outside compatible schema')
                validate(child)
            return
        raise ValueError('Snapshot value outside compatible schema')
    validate(value)
    data = json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)
    return hashlib.sha256(data.encode('utf-8')).hexdigest()


class ReceiptBackend:
    def __init__(self, transport):
        self.transport = transport
        self.binding = copy.deepcopy(transport.binding)
        self.revision = 0
        self.intent = {k: self.binding[k] for k in
                       ('sourceSha', 'controllerSha', 'runId', 'artifactSha256', 'versionCode')}
        self.value = None
        self.node_state = None
        self.blocked = False

    def _check(self, package, value):
        if self.blocked:
            raise RuntimeError('Receipt backend blocked; no retry')
        if package != self.binding['package'] or not isinstance(value, dict):
            raise ValueError('Foreign receipt')
        if value.get('journalOwner') != self.binding['owner']:
            raise ValueError('Foreign owner')
        if value.get('package') != package or value.get('sourceSha') != self.binding['sourceSha'] or value.get('versionCode') != self.binding['versionCode']:
            raise ValueError('Foreign release')
        if 'sha256' in value and value['sha256'] != self.binding['artifactSha256']:
            raise ValueError('Foreign artifact')
        if set(value) - {'journalOwner', 'package', 'sourceSha', 'versionCode', 'sha256', 'state', 'editId', 'track', 'expectedTrack', 'otherTracksBefore', 'committed', 'acknowledged', 'verified', 'errorType'}:
            raise ValueError('Unknown receipt field')
        if value.get('acknowledged', False) is not False or value.get('verified', False) is not False or value.get('committed') is not None:
            raise ValueError('Store outcome must come from trusted internal helper')

    def _exchange(self, operation, intent, state=None):
        record = self.transport.request(operation, intent, self.revision, state)
        if record is None or record['intent'] != intent:
            raise ValueError('Durable projection not verified')
        return record

    def create_if_absent(self, package, value):
        try:
            self._check(package, value)
            if self.value is not None or self.revision != 0 or value['state'] != 'reserved':
                raise ValueError('Reservation replay')
            record = self._exchange('reserve', self.intent)
            self.revision, self.node_state = record['revision'], record['state']
            self.value = copy.deepcopy(value)
        except Exception:
            self.blocked = True
            raise RuntimeError('Receipt reservation unverified; no retry') from None

    def replace_owned(self, package, owner, value):
        try:
            self._check(package, value)
            if owner != self.binding['owner'] or self.value is None:
                raise ValueError('Reservation required')
            state = value['state']
            allowed = {'reserved': {'edit_open'}, 'edit_open': {'pending', 'reconciliation_required'}, 'pending': {'unknown', 'reconciliation_required'}}
            if state not in allowed.get(self.node_state, set()):
                raise ValueError('Unsafe receipt transition')
            intent = copy.deepcopy(self.intent)
            if 'editId' in value:
                if 'editId' in intent and intent['editId'] != value['editId']:
                    raise ValueError('Foreign edit')
                intent['editId'] = value['editId']
            if state == 'edit_open' and 'editId' not in intent:
                raise ValueError('Edit evidence required')
            if state == 'pending':
                for field, target in [('expectedTrack', 'expectedTrackSha256'), ('otherTracksBefore', 'otherTracksBeforeSha256')]:
                    data = value[field]
                    if not isinstance(data, dict):
                        raise ValueError('Staged snapshot required')
                    intent[target] = snapshot_digest(data)
                intent['track'] = value['track']
            for field in ('track', 'expectedTrack', 'otherTracksBefore', 'editId'):
                if field in self.value and value.get(field) != self.value[field]:
                    raise ValueError('Staged receipt changed')
            node_state = 'reconciliation_required' if state == 'unknown' else state
            record = self._exchange('advance', intent, node_state)
            self.intent, self.revision, self.node_state = intent, record['revision'], record['state']
            self.value = copy.deepcopy(value)
        except Exception:
            self.blocked = True
            raise RuntimeError('Receipt update unverified; no retry') from None

    def read(self, package):
        try:
            if self.blocked or package != self.binding['package'] or self.value is None:
                raise ValueError('Owned projection unavailable')
            record = self._exchange('read', self.intent)
            if record['state'] != self.node_state:
                raise ValueError('Receipt state changed')
            return copy.deepcopy(self.value)
        except Exception:
            self.blocked = True
            raise RuntimeError('Receipt read unverified; no retry') from None
