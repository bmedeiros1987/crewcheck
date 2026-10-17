"""Read-only Play evidence; never opens an edit or authorizes publication."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from urllib.parse import quote

from crewwatch_internal import play_session

PACKAGE = 'com.crewcheck.app'
TRACKS = ('production', 'qa', 'internal', 'alpha', 'beta', 'wear:qa', 'wear:internal')
OPTIONAL_ALIASES = ('qa', 'wear:qa')
ACCESS_TRACKS = ('production', 'internal')
PUBLISHED = 'RELEASE_LIFECYCLE_STATE_PUBLISHED'


def controller_sha():
    import re
    sha = os.environ.get('GITHUB_SHA', '')
    return sha if re.fullmatch(r'[0-9a-f]{40}', sha) else None


def inspect(session):
    report = dict(package=PACKAGE, controllerSourceSha=controller_sha(),
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
                raw_codes = [a['versionCode'] for a in release.get('activeArtifacts', [])]
                assert all(type(code) is int or (type(code) is str and code.isascii()
                    and code.isdigit() and not code.startswith('0')) for code in raw_codes)
                codes = [int(code) for code in raw_codes]
                assert all(0 < c < 2_100_000_000 for c in codes)
                state = release['releaseLifecycleState']
                assert type(state) is str and state
                summaries.append(dict(state=state, versionCodes=codes))
            report['tracks'][track] = {'httpStatus': response.status_code, 'releases': summaries,
                                       'boundedListing': True}
            if len(releases) == 20:
                report['blockers'].append(f'{track}: listing may be truncated')
            if any(r['state'] != PUBLISHED for r in summaries):
                report['blockers'].append(f'{track}: unresolved or unknown release lifecycle')
        except Exception as error:
            # Never print credentials, raw response payloads, or exception text.
            report['tracks'][track] = {'state': 'unverified', 'errorType': type(error).__name__}
    # A 404 on a historical optional alias is not a credential verdict when
    # package access is independently verified on both canonical tracks. Keep
    # the raw error/unverified state: 404 alone never proves track absence.
    report['readAccessVerified'] = all(
        report['tracks'][track].get('state') != 'unverified'
        and 200 <= report['tracks'][track].get('httpStatus', 0) < 300
        for track in ACCESS_TRACKS)
    for track in OPTIONAL_ALIASES:
        value = report['tracks'][track]
        if value.get('httpStatus') == 404:
            value.update(optionalAlias=True, absenceConfirmed=False)
            report['blockers'].append(f'{track}: optional alias returned HTTP 404; remains unverified, absence/inventory not proved')
    return report


def inspection_failed(report):
    """Inspection success means bounded read access, never release permission."""
    if 'errorType' in report or report.get('readAccessVerified') is not True:
        return True
    return any(value.get('state') == 'unverified'
               and not (track in OPTIONAL_ALIASES and value.get('httpStatus') == 404)
               for track, value in report.get('tracks', {}).items())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    report = dict(package=PACKAGE, controllerSourceSha=controller_sha(),
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
    if inspection_failed(report):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
