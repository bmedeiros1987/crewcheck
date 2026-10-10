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
