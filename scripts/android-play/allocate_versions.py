"""Resolve monotonically increasing Play version codes from live app state."""
import argparse
import copy
import json
import os
from pathlib import Path

MAX_VERSION_CODE = 2_100_000_000
SHARED_PACKAGE = 'com.crewcheck.app'
WATCHFACE_PACKAGE = 'com.crewcheck.watch.app'


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


def select_live_package_policy(policy, package=None):
    # Package isolation only; does not provide shared-package coordination authority.
    packages = {v['package'] for v in policy['artifacts'].values()}
    if package is None:
        assert SHARED_PACKAGE not in packages, 'Live shared-package writer disabled: journal adoption/exclusivity unverified'
    else:
        assert package == WATCHFACE_PACKAGE, 'Only existing independent WatchFace scope supported'
        assert package in packages, 'Selected package missing'
    selected = copy.deepcopy(policy)
    selected['artifacts'] = {m: v for m, v in selected['artifacts'].items() if package is None or v['package'] == package}
    assert set(selected['artifacts']) == {'watchface'} and selected['artifacts']['watchface']['package'] == WATCHFACE_PACKAGE
    selected['knownMaxVersionCode'] = {WATCHFACE_PACKAGE: policy['knownMaxVersionCode'][WATCHFACE_PACKAGE]}
    return selected


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--package', choices=[WATCHFACE_PACKAGE])
    args = parser.parse_args(argv)
    assert os.environ.get('GITHUB_REF') == 'refs/heads/main', 'Live Play allocation requires main'
    assert os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch', 'Manual allocation only'
    policy_path = Path('scripts/android-play/release-policy.json')
    original_policy = json.loads(policy_path.read_text())
    policy = select_live_package_policy(original_policy, args.package)

    # Keep Google client imports out of module import time so unit tests remain dependency-free.
    import google.auth.transport.requests
    from google.oauth2 import service_account
    import requests
    from credential import load_service_account_secret

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
            apks = api('GET', edit_url + '/apks').get('apks', [])
            codes = [int(b['versionCode']) for b in bundles + apks]
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
    original_policy['artifacts'].update(resolved['artifacts'])
    original_policy['knownMaxVersionCode'].update(resolved['knownMaxVersionCode'])
    policy_path.write_text(json.dumps(original_policy, indent=2) + '\n')

    for module, spec in resolved['artifacts'].items():
        print(f"[android-play] {module}: {spec['package']} versionCode={spec['versionCode']}")


if __name__ == '__main__':
    main()
