"""One explicitly authorized Wear pilot; no main merge, phone upload or production track."""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from urllib.parse import quote

SOURCE = 'a1f4e5fe3700d288c553df651b31999ae0d066c6'
REPO = 'bmedeiros1987/crewcheck'
BRANCH = 'release/wear-pr837-internal-a1f4e5fe'
CERT = '4b5a06b5b77798ee1ff5681952a53da4f1bb03cdc7d07f69d7e868f62f61f454'
MODULES = {'wear': 'com.crewcheck.app', 'watchface': 'com.crewcheck.watch.app'}
REQUIRED_CI = {
    'Watch Face picker previews', 'Watch Face WFF v1 specification',
    'CrewWatch premium consolidated', 'Android signed store bundles',
    'Wear ownership handoff', 'CrewCheck privacy P0', 'CrewCheck Android bundled shell',
}
FILES = {'.github/workflows/wear-pr837-internal.yml',
         'peripherals/release/pr837-internal/release.py',
         'peripherals/release/pr837-internal/test_release.py',
         'peripherals/release/pr837-internal/README.md'}


def require(ok, message):
    if not ok:
        raise ValueError(message)


def write_json(path, obj):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(obj, indent=2, ensure_ascii=False) + '\n')


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def check_context(env):
    require(env.get('GITHUB_REPOSITORY') == REPO, 'Wrong repository')
    require(env.get('GITHUB_REF') == 'refs/heads/' + BRANCH, 'Only the authorized pilot branch')
    require(env.get('GITHUB_EVENT_NAME') == 'push', 'Only an explicit pilot branch push')


def check_policy(policy):
    require(policy['versionName'] == '14.4.10', 'Unexpected version name')
    require(policy['uploadCertificateSha256'] == CERT, 'Unexpected upload identity')
    for module, package in MODULES.items():
        spec = policy['artifacts'][module]
        require(spec['package'] == package and spec['track'] == 'wear:qa'
                and spec['watch'] is True, 'Wrong form factor, package or track')
        require(spec['minSdk'] == (30 if module == 'wear' else 33)
                and spec['targetSdk'] == 36, 'SDK contract changed')
        code = spec['versionCode']
        require(type(code) is int and policy['knownMaxVersionCode'][package] < code < 2100000000,
                'Non-upgradeable version code')


def pick_track(tracks):
    candidates = [t for t in tracks if t.get('track') in ('wear:qa', 'wear:internal')]
    require(len(candidates) == 1, 'Wear internal track absent or ambiguous; no fallback to phone/production')
    track = candidates[0]
    require(all(r.get('status') == 'completed' for r in track.get('releases', [])),
            'Existing unfinished release must be resolved explicitly')
    return track


def max_code(tracks, bundles, floor):
    values = [int(floor)] + [int(b['versionCode']) for b in bundles]
    values += [int(v) for t in tracks for r in t.get('releases', []) for v in r.get('versionCodes', [])]
    return max(values)


def release_body(track, code):
    require(track in ('wear:qa', 'wear:internal'), 'Only Wear internal testing is authorized')
    require(type(code) is int and 0 < code < 2100000000, 'Invalid release code')
    return {'track': track, 'releases': [{
        'name': 'CrewCheck 14.4.10 pilot ' + SOURCE[:8],
        'versionCodes': [str(code)], 'status': 'completed',
        'releaseNotes': [{'language': 'pt-BR', 'text':
            'Teste interno autorizado: CrewWatch e mostrador premium com três visuais, '
            'três paletas e prévias. Fonte PR #837 ' + SOURCE + '. Validação física pendente.'}],
    }]}


def independent_green(runs):
    latest = {}
    for r in runs:
        if r.get('head_sha') != SOURCE or r.get('event') not in ('pull_request', 'push', 'workflow_dispatch'):
            continue
        key = r.get('workflow_id', r['name'])
        if key not in latest or (r['id'], r.get('run_attempt', 1)) > (latest[key]['id'], latest[key].get('run_attempt', 1)):
            latest[key] = r
    passed = {r['name'] for r in latest.values() if r.get('status') == 'completed' and r.get('conclusion') == 'success'}
    require(REQUIRED_CI <= passed, 'Required exact-source CI absent, pending or not green')
    require(all(r.get('status') == 'completed' and r.get('conclusion') in ('success', 'skipped') for r in latest.values()),
            'An exact-source workflow is pending/red')


def github_gate():
    import requests
    session = requests.Session()
    session.headers.update({'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'Accept': 'application/vnd.github+json'})
    runs = []
    for page in range(1, 101):
        response = session.get(f'https://api.github.com/repos/{REPO}/actions/runs',
                               params={'head_sha': SOURCE, 'per_page': 100, 'page': page}, timeout=30)
        response.raise_for_status()
        batch = response.json()['workflow_runs']; runs.extend(batch)
        if len(batch) < 100: break
    else: raise ValueError('CI pagination limit reached')
    independent_green(runs)
    print('PASS: independent exact-source CI is green for ' + SOURCE)


def play_client():
    import google.auth.transport.requests
    from google.oauth2 import service_account
    from credential import load_service_account_secret
    from play_error import safe_play_error
    account = load_service_account_secret(os.environ['PLAY_SERVICE_ACCOUNT_JSON'])
    cred = service_account.Credentials.from_service_account_info(account, scopes=['https://www.googleapis.com/auth/androidpublisher'])
    session = google.auth.transport.requests.AuthorizedSession(cred)
    def api(method, url, **kwargs):
        response = session.request(method, url, timeout=300, **kwargs)
        if not response.ok: raise RuntimeError(safe_play_error(response))
        return response.json() if response.content else {}
    return session, api


def edit_base(package):
    require(package in MODULES.values(), 'Package outside pilot allowlist')
    return f'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{package}/edits'


def allocate(source, out):
    policy_path = source / 'scripts/android-play/release-policy.json'
    policy = json.loads(policy_path.read_text()); check_policy(policy)
    original_app = copy.deepcopy(policy['artifacts']['app'])
    session, api = play_client()
    before = {'sourceSha': SOURCE, 'releaseCommit': os.environ['GITHUB_SHA'], 'packages': {}}
    for module, package in MODULES.items():
        base = edit_base(package); edit = api('POST', base, json={})['id']; url = base + '/' + edit
        try:
            tracks = api('GET', url + '/tracks').get('tracks', [])
            bundles = api('GET', url + '/bundles').get('bundles', [])
            track = pick_track(tracks)
            floor = max_code(tracks, bundles, policy['knownMaxVersionCode'][package])
            require(floor + 1 < 2100000000, 'Version exhaustion')
            before['packages'][package] = {'track': track, 'bundles': bundles}
            policy['knownMaxVersionCode'][package] = floor
            policy['artifacts'][module]['versionCode'] = floor + 1
            print(f'ALLOCATED {module}: {package} versionCode={floor + 1}, Wear internal only')
        finally:
            session.delete(url, timeout=30)
    require(policy['artifacts']['app'] == original_app, 'Phone policy must not change')
    check_policy(policy)
    write_json(out / 'previous-internal-releases.json', before)
    write_json(policy_path, policy)
    write_json(out / 'resolved-release-policy.json', policy)


def stage(source, out, bundletool):
    from validate import validate_manifest, run
    policy = json.loads((out / 'resolved-release-policy.json').read_text()); check_policy(policy)
    expected = os.environ.get('EXPECTED_UPLOAD_CERT_SHA256', '').replace(':', '').lower()
    require(expected == CERT, 'Signing identity mismatch')
    signer = sorted(Path(os.environ['ANDROID_HOME']).glob('build-tools/*/apksigner'))[-1]
    report = []
    for module, package in MODULES.items():
        aab = source / f'android-wrapper/{module}/build/outputs/bundle/release/{module}-release.aab'
        apk = source / f'android-wrapper/{module}/build/outputs/apk/release/{module}-release.apk'
        run(['java', '-jar', bundletool, 'validate', '--bundle=' + str(aab)])
        xml = run(['java', '-jar', bundletool, 'dump', 'manifest', '--bundle=' + str(aab), '--module=base'])
        spec = validate_manifest(xml, module, policy)
        sig = run(['jarsigner', '-J-Duser.language=en', '-verify', '-verbose', '-certs', str(aab)])
        require('jar verified.' in sig and not re.search('jar is unsigned|unsigned entries|not integrity-checked', sig, re.I), 'Invalid AAB signature')
        cert = run(['keytool', '-J-Duser.language=en', '-printcert', '-jarfile', str(aab)])
        match = re.search(r'SHA256:\s*([A-Fa-f0-9:]+)', cert)
        require(match and match[1].replace(':', '').lower() == CERT, 'Wrong AAB certificate')
        apk_sig = run([str(signer), 'verify', '--verbose', '--print-certs', str(apk)])
        require(CERT in apk_sig.replace(':', '').lower(), 'Wrong APK certificate')
        filename = f'CrewCheck-{module}-{spec["versionCode"]}.aab'
        shutil.copyfile(aab, out / filename)
        shutil.copyfile(apk, out / f'CrewCheck-{module}-{spec["versionCode"]}-signed.apk')
        (out / (module + '-manifest.xml')).write_text(xml)
        report.append(dict(module=module, file=filename, sha256=digest(aab), certificateSha256=CERT, **spec))
    meta = {'sourceSha': SOURCE, 'releaseCommit': os.environ['GITHUB_SHA'], 'report': report}
    write_json(out / 'release-report.json', meta)
    (out / 'SHA256SUMS.txt').write_text(''.join(f'{digest(p)}  {p.name}\n' for p in sorted(out.iterdir()) if p.suffix in ('.aab', '.apk')))
    check_report(out, meta, policy)
    print('PASS: only Wear and Watch Face signed APK/AAB manifests and certificates verified')


def check_report(out, meta, policy):
    check_policy(policy)
    require(meta.get('sourceSha') == SOURCE, 'Unapproved source')
    report = meta['report']
    require(len(report) == 2 and {r['module'] for r in report} == set(MODULES), 'Must contain only two Wear modules')
    for item in report:
        spec = policy['artifacts'][item['module']]
        require(all(item[k] == v for k, v in spec.items()), 'Policy/report mismatch')
        require(item['certificateSha256'] == CERT, 'Wrong signing certificate')
        require(item['file'] == f'CrewCheck-{item["module"]}-{spec["versionCode"]}.aab', 'Unsafe filename')
        require(digest(out / item['file']) == item['sha256'], 'Checksum mismatch')


def publish(source, out):
    from review_policy import commit_internal_edit
    meta = json.loads((out / 'release-report.json').read_text())
    policy = json.loads((out / 'resolved-release-policy.json').read_text())
    check_report(out, meta, policy)
    require(meta['releaseCommit'] == os.environ['GITHUB_SHA'], 'Artifact from a different release run')
    session, api = play_client()
    results = {'sourceSha': SOURCE, 'releaseCommit': os.environ['GITHUB_SHA'], 'packages': []}
    write_json(out / 'publish-result.json', results)
    for item in meta['report']:
        package = item['package']; base = edit_base(package)
        edit = api('POST', base, json={})['id']; url = base + '/' + edit; committed = False
        try:
            tracks = api('GET', url + '/tracks').get('tracks', [])
            bundles = api('GET', url + '/bundles').get('bundles', [])
            track = pick_track(tracks); code = item['versionCode']
            require(code > max_code(tracks, bundles, policy['knownMaxVersionCode'][package]), 'A newer Play release exists; rebuild, never downgrade')
            other_before = {t['track']: t for t in tracks if t['track'] != track['track']}
            upload = f'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/{package}/edits/{edit}/bundles?uploadType=media'
            with (out / item['file']).open('rb') as stream:
                uploaded = api('POST', upload, data=stream, headers={'Content-Type': 'application/octet-stream'})
            require(int(uploaded['versionCode']) == code and uploaded.get('sha256', '').lower() == item['sha256'], 'Upload code/hash mismatch')
            body = release_body(track['track'], code)
            api('PUT', url + '/tracks/' + quote(track['track'], safe=''), json=body)
            after = api('GET', url + '/tracks').get('tracks', [])
            require({t['track']: t for t in after if t['track'] != track['track']} == other_before, 'Non-target track changed')
            _, review_mode = commit_internal_edit(api, url); committed = True
            result = {'package': package, 'module': item['module'], 'track': track['track'],
                      'versionCode': code, 'versionName': policy['versionName'] + '-' + item['module'],
                      'sha256': item['sha256'], 'reviewMode': review_mode, 'committed': True,
                      'readbackVerified': False, 'previousInternalTrack': track}
            results['packages'].append(result); write_json(out / 'publish-result.json', results)
            verify_edit = api('POST', base, json={})['id']; verify_url = base + '/' + verify_edit
            try:
                live = api('GET', verify_url + '/tracks').get('tracks', [])
                got = next((t for t in live if t['track'] == track['track']), {})
                require(any(str(code) in r.get('versionCodes', []) for r in got.get('releases', [])), 'Commit recorded but readback has not confirmed code')
                require({t['track']: t for t in live if t['track'] != track['track']} == other_before, 'Non-target track changed during release')
                result['readbackVerified'] = True; write_json(out / 'publish-result.json', results)
            finally:
                session.delete(verify_url, timeout=30)
            message = f'{package} {track["track"]} versionCode={code}: COMMITTED AND READ BACK ({review_mode}); phone/production tracks untouched.'
            print(message)
            with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
                summary.write(message + '\n\n')
        finally:
            if not committed: session.delete(url, timeout=30)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['guard', 'allocate', 'stage', 'publish'])
    parser.add_argument('--source', default='source')
    parser.add_argument('--out', default='wear-internal-output')
    parser.add_argument('--bundletool', default='bundletool.jar')
    args = parser.parse_args()
    check_context(os.environ)
    source, out = Path(args.source).resolve(), Path(args.out).resolve(); out.mkdir(parents=True, exist_ok=True)
    require(subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip() == SOURCE, 'Source checkout moved')
    sys.path.insert(0, str(source / 'scripts/android-play'))
    if args.command == 'guard':
        paths = subprocess.check_output(['git', 'diff', '--name-only', SOURCE, os.environ['GITHUB_SHA']], text=True).splitlines()
        require(paths and set(paths) <= FILES, 'Pilot branch contains unrelated implementation changes')
        github_gate()
    elif args.command == 'allocate': allocate(source, out)
    elif args.command == 'stage': stage(source, out, args.bundletool)
    elif args.command == 'publish': github_gate(); publish(source, out)


if __name__ == '__main__': main()
