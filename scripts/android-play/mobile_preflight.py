"""Read-only Play evidence; never opens an edit or authorizes publication."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from urllib.parse import quote

from crewwatch_internal import play_session

PACKAGE = 'com.crewcheck.app'
SOURCE_SHA = 'ba3723a426184aadf9f1b1bf8106129f0179c5bd'
TRACKS = ('production', 'qa', 'internal', 'alpha', 'beta', 'wear:qa', 'wear:internal')
PUBLISHED = 'RELEASE_LIFECYCLE_STATE_PUBLISHED'


def inspect(session):
    report = dict(package=PACKAGE, candidateSourceSha=SOURCE_SHA,
                  observedAt=datetime.now(timezone.utc).isoformat(),
                  productionEligibility='unknown', publicationAllowed=False,
                  completeTrackInventory=False, completeVersionInventory=False,
                  tracks={}, blockers=['Console eligibility, declarations, all custom tracks, '
                    'unfinished rollouts, independent review and prior commit receipts require verification.'])
    for track in TRACKS:
        url = (f'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE}'
               f'/tracks/{quote(track, safe="")}/releases')
        try:
            response = session.request('GET', url, timeout=30)
            if not 200 <= response.status_code < 300:
                report['tracks'][track] = {'httpStatus': response.status_code, 'state': 'unverified'}
                continue
            payload = response.json()
            assert isinstance(payload, dict) and 'error' not in payload
            # ProtoJSON omits empty repeated fields. Default only an absent key;
            # explicit null, invalid types and API errors must remain unverified.
            releases = payload.get('releases', [])
            assert isinstance(releases, list) and len(releases) <= 20
            summaries = []
            for release in releases:
                assert release['track'] == track
                codes = [int(a['versionCode']) for a in release.get('activeArtifacts', [])]
                assert all(0 < c < 2_100_000_000 for c in codes)
                summaries.append(dict(state=release['releaseLifecycleState'], versionCodes=codes))
            report['tracks'][track] = {'httpStatus': response.status_code, 'releases': summaries,
                                       'boundedListing': True}
            if len(releases) == 20:
                report['blockers'].append(f'{track}: listing may be truncated')
            if any(r['state'] != PUBLISHED for r in summaries):
                report['blockers'].append(f'{track}: unresolved or unknown release lifecycle')
        except Exception as error:
            # Never print credentials, raw response payloads, or exception text.
            report['tracks'][track] = {'state': 'unverified', 'errorType': type(error).__name__}
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    report = dict(package=PACKAGE, candidateSourceSha=SOURCE_SHA,
                  productionEligibility='unknown', publicationAllowed=False,
                  blockers=['Existing Play credential unavailable or authentication failed.'])
    try:
        if not os.environ.get('PLAY_SERVICE_ACCOUNT_JSON'):
            raise ValueError('Missing credential')
        report = inspect(play_session())
    except Exception as error:
        report['errorType'] = type(error).__name__
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + '\n')
    print('Play evidence saved; publication remains blocked; production eligibility unknown.')
    if 'errorType' in report or any(t.get('state') == 'unverified' for t in report.get('tracks', {}).values()):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
