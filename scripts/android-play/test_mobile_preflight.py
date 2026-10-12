"""Fake authenticated session verifies every Play operation is GET and fails closed."""
import mobile_preflight as m


class Response:
    ok = True
    status_code = 200

    def __init__(self, track, state):
        self.track, self.state = track, state

    def json(self):
        return {'releases': [{'track': self.track, 'releaseLifecycleState': self.state,
                              'activeArtifacts': [{'versionCode': 144200}]}]}


class Session:
    def __init__(self, state=m.PUBLISHED, fail=False):
        self.state, self.fail, self.calls = state, fail, []

    def request(self, method, url, **kwargs):
        assert method == 'GET' and '/edits' not in url and m.PACKAGE in url
        assert 'com.crewcheck.watch.app' not in url and 'json' not in kwargs
        self.calls.append(url)
        if self.fail:
            raise TimeoutError('synthetic sensitive text must never be emitted')
        from urllib.parse import unquote
        return Response(unquote(url.split('/tracks/')[1].split('/')[0]), self.state)


for state in (m.PUBLISHED, 'RELEASE_LIFECYCLE_STATE_IN_REVIEW',
              'RELEASE_LIFECYCLE_STATE_DRAFT', 'NEW_UNKNOWN_STATE'):
    session = Session(state)
    report = m.inspect(session)
    assert len(session.calls) == len(m.TRACKS)
    assert report['publicationAllowed'] is False and report['productionEligibility'] == 'unknown'
    assert report['completeVersionInventory'] is False
    assert report['tracks']['production']['releases'][0]['versionCodes'] == [144200]
    if state != m.PUBLISHED:
        assert any('unresolved' in b for b in report['blockers'])
report = m.inspect(Session(fail=True))
assert all(t['errorType'] == 'TimeoutError' for t in report['tracks'].values())
assert 'synthetic sensitive' not in str(report)
print('PASS: GET-only mobile package inspection; uncertain, pending and published states never authorize release')


class PayloadResponse:
    def __init__(self, payload, status=200, malformed=False):
        self.payload, self.status_code, self.malformed = payload, status, malformed
        self.ok = status < 400  # Match requests.Response.ok, including redirects.
        self.json_calls = 0

    def json(self):
        self.json_calls += 1
        if self.malformed:
            raise ValueError('synthetic sensitive malformed response body')
        return self.payload


class PayloadSession:
    def __init__(self, response): self.response = response
    def request(self, method, url, **kwargs):
        assert method == 'GET' and '/edits' not in url
        return self.response


for payload in ({}, {'releases': []}):
    report = m.inspect(PayloadSession(PayloadResponse(payload)))
    assert all(t == {'httpStatus': 200, 'releases': [], 'boundedListing': True}
               for t in report['tracks'].values())
    assert report['publicationAllowed'] is False and report['productionEligibility'] == 'unknown'
    assert report['completeVersionInventory'] is False and report['completeTrackInventory'] is False

for payload in (None, [], 'synthetic sensitive body', 17, {'releases': None},
                {'releases': {}}, {'releases': 'synthetic sensitive body'},
                {'releases': [None]}, {'releases': [{}]},
                {'error': {'message': 'synthetic sensitive body'}}):
    report = m.inspect(PayloadSession(PayloadResponse(payload)))
    assert all(t.get('state') == 'unverified' and 'releases' not in t
               for t in report['tracks'].values())
    assert 'synthetic sensitive' not in str(report)

report = m.inspect(PayloadSession(PayloadResponse({}, malformed=True)))
assert all(t == {'state': 'unverified', 'errorType': 'ValueError'}
           for t in report['tracks'].values())
assert 'synthetic sensitive' not in str(report)

for status in (300, 301, 302, 307, 308, 400, 401, 403, 404, 429, 500):
    response = PayloadResponse({}, status=status, malformed=True)
    report = m.inspect(PayloadSession(response))
    assert response.json_calls == 0  # Error bodies never become empty releases.
    for name, value in report['tracks'].items():
        expected = {'httpStatus': status, 'state': 'unverified'}
        if status == 404 and name in m.OPTIONAL_ALIASES:
            expected.update(optionalAlias=True, absenceConfirmed=False)
        assert value == expected
    assert m.inspection_failed(report) is True
print('PASS: omitted/explicit empty releases accepted; malformed JSON/types and HTTP errors remain unverified without body leakage')

from unittest.mock import patch
for sha in ('', 'old-candidate', 'a' * 40):
    with patch.dict(m.os.environ, {'GITHUB_SHA': sha}):
        report = m.inspect(PayloadSession(PayloadResponse({})))
        assert report['controllerSourceSha'] == (sha if len(sha) == 40 else None)
        assert 'candidateSourceSha' not in report
        assert report['publicationAllowed'] is False
print('PASS: actual controller SHA reported; missing/invalid provenance stays unknown, never a stale candidate')


class MixedSession:
    def __init__(self, errors): self.errors, self.calls = errors, []
    def request(self, method, url, **kwargs):
        assert method == 'GET' and '/edits' not in url
        from urllib.parse import unquote
        track = unquote(url.split('/tracks/')[1].split('/')[0]); self.calls.append(track)
        if track in self.errors:
            return PayloadResponse({'error': {'message': 'private response'}}, status=self.errors[track])
        state = m.PUBLISHED if track not in ('production', 'alpha', 'beta') else 'RELEASE_LIFECYCLE_STATE_NOT_SENT_FOR_REVIEW'
        return Response(track, state)

session = MixedSession({'qa': 404, 'wear:qa': 404})
report = m.inspect(session)
assert session.calls == list(m.TRACKS)
assert report['readAccessVerified'] is True and m.inspection_failed(report) is False
for name in m.OPTIONAL_ALIASES:
    assert report['tracks'][name] == {'httpStatus': 404, 'state': 'unverified', 'optionalAlias': True, 'absenceConfirmed': False}
assert any('unresolved' in item and 'production' in item for item in report['blockers'])
assert report['tracks']['production']['releases'][0]['state'] == 'RELEASE_LIFECYCLE_STATE_NOT_SENT_FOR_REVIEW'
assert report['publicationAllowed'] is False and report['productionEligibility'] == 'unknown'
assert report['completeVersionInventory'] is False and report['completeTrackInventory'] is False
assert 'private response' not in str(report)
for errors in ({'qa': 403}, {'wear:qa': 401}, {'production': 404, 'qa': 404}, {'internal': 403, 'wear:qa': 404}, {'alpha': 500}, {'qa': 302}):
    result = m.inspect(MixedSession(errors))
    assert m.inspection_failed(result) is True
    assert all(result['tracks'][name]['httpStatus'] == status and result['tracks'][name]['state'] == 'unverified'
               for name, status in errors.items())
    assert result['publicationAllowed'] is False
print('PASS: optional alias 404 stays unverified/non-authorizing; canonical 200 proves bounded read access only; authentication, canonical-track, redirect and other read failures still fail')

for code in (True, 144200.5, '00144200', '１４４２００', '1e5', '', -1, 2100000000):
    payload = {'releases': [{'track': 'production', 'releaseLifecycleState': m.PUBLISHED, 'activeArtifacts': [{'versionCode': code}]}]}
    result = m.inspect(PayloadSession(PayloadResponse(payload)))
    assert result['tracks']['production']['state'] == 'unverified'
    assert m.inspection_failed(result) is True
print('PASS: malformed version codes are not coerced/truncated into release evidence')
