"""Publish only verified bundles to explicit internal tracks; no production code path."""
import hashlib
import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import quote
import google.auth.transport.requests
from google.oauth2 import service_account
import requests

def main():
    assert os.environ['GITHUB_REF'] == 'refs/heads/main', 'Publishing requires main'
    account = json.loads(os.environ['PLAY_SERVICE_ACCOUNT_JSON'])
    assert account.get('type') == 'service_account', 'Expected service account credential'
    credentials = service_account.Credentials.from_service_account_info(account, scopes=['https://www.googleapis.com/auth/androidpublisher'])
    session = google.auth.transport.requests.AuthorizedSession(credentials)
    root = Path(sys.argv[1])
    report = json.loads((root / 'release-report.json').read_text())
    policy = json.loads(Path('scripts/android-play/release-policy.json').read_text())
    assert {r['module'] for r in report} == set(policy['artifacts']), 'Incomplete release'
    for item in report:
        assert all(item[k] == v for k, v in policy['artifacts'][item['module']].items()), 'Report/policy mismatch'
        assert item['track'] in ['qa', 'wear:qa'], 'Only internal testing is authorized'
        assert Path(item['file']).name == item['file'], 'Invalid artifact filename'
        assert hashlib.sha256((root / item['file']).read_bytes()).hexdigest() == item['sha256'], 'Bundle checksum mismatch'

    # Require all current-commit CI except this publishing workflow to finish green.
    # Push workflows start concurrently, so wait instead of racing them and failing spuriously.
    gh = requests.Session()
    gh.headers.update({'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'Accept': 'application/vnd.github+json'})
    repo = os.environ['GITHUB_REPOSITORY']
    sha = os.environ['GITHUB_SHA']
    wait_deadline = time.time() + 12 * 60
    while True:
        runs = []
        page = 1
        while True:
            response = gh.get(
                f'https://api.github.com/repos/{repo}/actions/runs',
                params={'head_sha': sha, 'per_page': 100, 'page': page},
                timeout=30,
            )
            response.raise_for_status()
            batch = response.json()['workflow_runs']
            runs.extend(batch)
            if len(batch) < 100:
                break
            page += 1

        latest = {}
        for run in runs:
            if str(run['id']) == os.environ['GITHUB_RUN_ID']:
                continue
            key = run['workflow_id']
            if key not in latest or run['id'] > latest[key]['id']:
                latest[key] = run

        assert latest, 'No independent CI evidence for this commit'
        failed = [
            r for r in latest.values()
            if r['status'] == 'completed' and r['conclusion'] not in ['success', 'skipped']
        ]
        assert not failed, 'Independent CI failed; Play publication blocked'

        pending = [r for r in latest.values() if r['status'] != 'completed']
        if not pending:
            break
        if time.time() >= wait_deadline:
            raise AssertionError('Independent CI still pending after 12 minutes; Play publication blocked')
        print(f'Waiting for {len(pending)} independent CI workflow(s) before Play upload...')
        time.sleep(20)

    def api(method, url, **kwargs):
        response = session.request(method, url, timeout=300, **kwargs)
        if not response.ok:
            # Avoid dumping credential/session or arbitrary API payloads to public logs.
            raise RuntimeError(f'Play API returned HTTP {response.status_code}; inspect Console/access and retry')
        return response.json() if response.content else {}

    for package in sorted({r['package'] for r in report}):
        base = f'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{package}/edits'
        edit = api('POST', base, json={})['id']
        url = base + '/' + edit
        committed = False
        try:
            tracks = api('GET', url + '/tracks').get('tracks', [])
            bundles = api('GET', url + '/bundles').get('bundles', [])
            codes = [int(b['versionCode']) for b in bundles]
            codes += [int(v) for t in tracks for r in t.get('releases', []) for v in r.get('versionCodes', [])]
            known = max(codes + [policy['knownMaxVersionCode'][package]])
            items = [r for r in report if r['package'] == package]
            assert all(i['versionCode'] > known for i in items), 'Version already used or lower than a Play release; increment policy and rebuild'
            for item in items:
                # Current API documentation calls internal tracks qa; support the legacy
                # internal identifier only when it is explicitly returned by this app.
                aliases = {'qa': ['qa', 'internal'], 'wear:qa': ['wear:qa', 'wear:internal']}[item['track']]
                matches = [t for t in tracks if t['track'] in aliases]
                assert len(matches) == 1, 'Dedicated internal track missing or ambiguous in Play Console'
                track = matches[0]
                assert not any(r.get('status') in ['draft', 'inProgress', 'halted'] for r in track.get('releases', [])), 'Existing unfinished test release: resolve it explicitly in Console first'
                upload = f'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/{package}/edits/{edit}/bundles?uploadType=media'
                with (root / item['file']).open('rb') as bundle:
                    result = api('POST', upload, data=bundle, headers={'Content-Type': 'application/octet-stream'})
                assert int(result['versionCode']) == item['versionCode'], 'Uploaded wrong artifact'
                api(
                    'PUT',
                    url + '/tracks/' + quote(track['track'], safe=''),
                    json={
                        'track': track['track'],
                        'releases': [{
                            'name': policy['versionName'],
                            'versionCodes': [str(item['versionCode'])],
                            'status': 'completed',
                            'releaseNotes': [{
                                'language': 'pt-BR',
                                'text': 'Build piloto CrewCheck para teste interno automático.',
                            }],
                        }],
                    },
                )
            api('POST', url + ':validate')
            api('POST', url + ':commit')
            committed = True
            print(f'{package}: verified bundles RELEASED TO INTERNAL TESTING. Production untouched.')
        finally:
            if not committed:
                session.delete(url, timeout=30)

if __name__ == '__main__': main()
