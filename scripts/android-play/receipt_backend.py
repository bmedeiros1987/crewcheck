"""OFF receipt projection onto the existing journal; no connection or authority.

Local receipts only cache a projection whose revision/intent is verified by Node.
Caller flags cannot assert acknowledgement/reconciliation; internal helpers own
those outcomes. The mobile publisher can use this injected lifecycle, but no
production transport or executor capabilities are configured.
"""
import copy
import hashlib
import json


def snapshot_json(value):
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
    return data


def snapshot_digest(value):
    return hashlib.sha256(snapshot_json(value).encode('utf-8')).hexdigest()


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

    def project_verified_result(self, result, expected_track, other_tracks, observation=None):
        """Read existing helper result only; never advances a journal state.

        The supplied result is a lookup claim, not authority. Exact owned durable
        readback plus bound snapshot/proof hashes determines the projection.
        """
        try:
            if self.blocked or self.value is None:
                raise ValueError('Owned live projection required')
            result = copy.deepcopy(result)
            expected_track, other_tracks = copy.deepcopy(expected_track), copy.deepcopy(other_tracks)
            observation = copy.deepcopy(observation)
            required = {'package', 'owner', 'revision', 'state', 'intent', 'retryAllowed', 'storeAvailability'}
            if not isinstance(result, dict) or not required <= set(result):
                raise ValueError('Incomplete helper result')
            state = result['state']
            extra = {'observationSha256', 'rolloverAllowed'} if state == 'reconciled' else set()
            if set(result) != required | extra or result['retryAllowed'] is not False or result['storeAvailability'] != 'unknown':
                raise ValueError('Unsafe helper result')
            steps = {('edit_open', 'acknowledged'): 2, ('pending', 'acknowledged'): 1,
                     ('edit_open', 'reconciliation_required'): 2, ('pending', 'reconciliation_required'): 1,
                     ('edit_open', 'reconciled'): 3, ('pending', 'reconciled'): 2,
                     ('acknowledged', 'reconciled'): 1}
            delta = steps.get((self.node_state, state))
            if delta is None or type(result['revision']) is not int or result['revision'] != self.revision + delta:
                raise ValueError('Stale or unsupported result lifecycle')
            if result['package'] != self.binding['package'] or result['owner'] != self.binding['owner']:
                raise ValueError('Foreign result')
            intent = result['intent']
            if not isinstance(intent, dict):
                raise ValueError('Missing intent')
            for field, value in self.intent.items():
                if intent.get(field) != value:
                    raise ValueError('Bound intent changed')
            if not isinstance(expected_track, dict) or not isinstance(other_tracks, dict):
                raise ValueError('Snapshots required')
            track = expected_track.get('track')
            if track not in ('qa', 'internal') or intent.get('track') != track or track in other_tracks:
                raise ValueError('Foreign track')
            releases = expected_track.get('releases')
            if not isinstance(releases, list) or not releases:
                raise ValueError('Intended release absent')
            codes = []
            for release in releases:
                if not isinstance(release, dict) or release.get('status') != 'completed' or not isinstance(release.get('versionCodes'), list):
                    raise ValueError('Invalid staged release')
                codes.extend(release['versionCodes'])
            if str(self.binding['versionCode']) not in codes:
                raise ValueError('Intended version absent')
            if intent.get('expectedTrackSha256') != snapshot_digest(expected_track) or intent.get('otherTracksBeforeSha256') != snapshot_digest(other_tracks):
                raise ValueError('Snapshot drift')
            if state == 'reconciled':
                if not isinstance(observation, dict) or result['rolloverAllowed'] is not False:
                    raise ValueError('Complete proof required')
                for field, value in {'httpStatus': 200, 'package': result['package'], 'owner': result['owner'], 'revision': result['revision'] - 1,
                                     'editId': intent['editId'], 'targetTrack': expected_track, 'otherTracks': other_tracks}.items():
                    if observation.get(field) != value:
                        raise ValueError('Foreign reconciliation proof')
                if observation.get('inventoryComplete') is not True or any(observation.get(field) is not False for field in ('pendingReview', 'unfinishedRelease', 'unresolvedEdits')):
                    raise ValueError('Incomplete reconciliation')
                proof = snapshot_digest(observation)
                if result['observationSha256'] != proof or intent.get('reconciliationSha256') != proof:
                    raise ValueError('Proof hash mismatch')
            elif observation is not None or 'reconciliationSha256' in intent:
                raise ValueError('Unexpected final proof')
            expected = {field: result[field] for field in ('package', 'owner', 'revision', 'state', 'intent')}
            # Read is the only transport operation here. Input cannot make a
            # final state: actual Node record must already exist and match.
            actual = self.transport.request('read', intent, result['revision'])
            if actual != expected:
                raise ValueError('Final result not durably verified')
            positive = state in ('acknowledged', 'reconciled')
            value = dict(sourceSha=self.binding['sourceSha'], package=self.binding['package'], journalOwner=self.binding['owner'],
                         versionCode=self.binding['versionCode'], sha256=self.binding['artifactSha256'], editId=intent['editId'],
                         track=track, expectedTrack=expected_track, otherTracksBefore=other_tracks, state=state,
                         committed=True if positive else None, acknowledged=positive, verified=state == 'reconciled',
                         storeAvailability='unknown', retryAllowed=False, rolloverAllowed=False)
            self.intent, self.revision, self.node_state = copy.deepcopy(intent), actual['revision'], actual['state']
            self.value = copy.deepcopy(value)
            return copy.deepcopy(value)
        except Exception:
            self.blocked = True
            raise RuntimeError('Final receipt readback unverified; no retry or store action') from None

    def commit_staged(self, package, owner, value):
        """Invoke the existing executor helper; caller cannot assert an outcome."""
        try:
            self._check(package, value)
            if owner != self.binding['owner'] or self.node_state != 'edit_open' or value['state'] != 'pending':
                raise ValueError('Owned edit required before coordinated commit')
            expected, others = value['expectedTrack'], value['otherTracksBefore']
            track = value['track']
            if not isinstance(expected, dict) or expected.get('track') != track or track not in ('qa', 'internal'):
                raise ValueError('Staged target identity unverified')
            if not isinstance(others, dict) or track in others:
                raise ValueError('Other-track identity unverified')
            releases = expected.get('releases')
            if not isinstance(releases, list) or not releases:
                raise ValueError('Intended release absent')
            codes = []
            for release in releases:
                if not isinstance(release, dict) or release.get('status') != 'completed' or not isinstance(release.get('versionCodes'), list):
                    raise ValueError('Invalid staged release')
                for code in release['versionCodes']:
                    if type(code) is not str or not code.isascii() or not code.isdigit() or code.startswith('0') or not 0 < int(code) < 2100000000:
                        raise ValueError('Invalid staged version')
                codes.extend(release['versionCodes'])
            if str(self.binding['versionCode']) not in codes or value.get('editId') != self.intent.get('editId'):
                raise ValueError('Intended version/edit absent')
            intent = dict(self.intent, track=track, expectedTrackSha256=snapshot_digest(expected), otherTracksBeforeSha256=snapshot_digest(others))
            for field in ('track', 'expectedTrack', 'otherTracksBefore', 'editId'):
                if field in self.value and value.get(field) != self.value[field]:
                    raise ValueError('Staged receipt changed')
            response = self.transport.request('commit', intent, self.revision)
            return self.project_verified_result(response['result'], expected, others)
        except Exception:
            self.blocked = True
            raise RuntimeError('Coordinated commit unverified; preserve reservation and do not retry') from None

    def reconcile_verified(self, package, owner):
        try:
            if self.blocked or owner != self.binding['owner'] or package != self.binding['package'] or self.node_state != 'acknowledged':
                raise ValueError('Verified acknowledgement required')
            response = self.transport.request('reconcile', self.intent, self.revision)
            return self.project_verified_result(response['result'], self.value['expectedTrack'], self.value['otherTracksBefore'], response['observation'])
        except Exception:
            self.blocked = True
            raise RuntimeError('Coordinated reconciliation unverified; preserve reservation and do not retry') from None

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
