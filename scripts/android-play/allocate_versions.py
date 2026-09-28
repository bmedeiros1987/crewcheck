"""Resolve monotonically increasing Play version codes from live app state."""
import copy
import json
import os
from pathlib import Path

MAX_VERSION_CODE = 2_100_000_000


def allocate_version_codes(policy, live_codes_by_package):
    resolved = copy.deepcopy(policy)
    artifacts = resolved['artifacts']
    for package in sorted({spec['package'] for spec in artifacts.values()}):
        live = [int(v) for v in live_codes_by_package.get(package, [])]
        floor = max(live + [int(resolved['knownMaxVersionCode'][package])])
        resolved['knownMaxVersionCode'][package] = floor
        next_code = floor + 1
        for _module, spec in artifacts.items():
            if spec['package'] != package:
                continue
            if next_code >= MAX_VERSION_CODE:
                raise ValueError(f'No safe Play versionCode remains for {package}')
            spec['versionCode'] = next_code
            next_code += 1
    return resolved


def main():
    assert os.environ.get('GITHUB_REF') == 'refs/heads/main', 'Live Play allocation requires main'

    # Keep Google client imports out of module import time so unit tests remain dependency-free.
    import google.auth.transport.requests
    from google.oauth2 import service_account
    import requests
    from credential import load_service_account_secret

    policy_path = Path('scripts/android-play/release-policy.json')
    policy = json.loads(policy_path.read_text())
    account = load_service_account_secret(os.environ.get('PLAY_SERVICE_ACCOUNT_JSON'))
    credentials = service_account.Credentials.from_service_account_info(
        account,
        scopes=['https://www.googleapis.com/auth/androidpublisher'],
    )
    session = google.auth.transport.requests.AuthorizedSession(credentials)

    def api(method, url, **kwargs):
        response = session.request(method, url, timeout=120, **kwargs)
        if not response.ok:
            raise RuntimeError(f'Play API returned HTTP {response.status_code} during version allocation')
        return response.json() if response.content else {}

    live = {}
    for package in sorted({spec['package'] for spec in policy['artifacts'].values()}):
        base = f'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{package}/edits'
        edit_id = api('POST', base, json={})['id']
        edit_url = base + '/' + edit_id
        try:
            tracks = api('GET', edit_url + '/tracks').get('tracks', [])
            bundles = api('GET', edit_url + '/bundles').get('bundles', [])
            codes = [int(b['versionCode']) for b in bundles]
            codes += [
                int(version)
                for track in tracks
                for release in track.get('releases', [])
                for version in release.get('versionCodes', [])
            ]
            live[package] = codes
        finally:
            session.delete(edit_url, timeout=30)

    resolved = allocate_version_codes(policy, live)
    policy_path.write_text(json.dumps(resolved, indent=2) + '\n')

    for module, spec in resolved['artifacts'].items():
        print(f"[android-play] {module}: {spec['package']} versionCode={spec['versionCode']}")


if __name__ == '__main__':
    main()
