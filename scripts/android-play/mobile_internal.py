"""Single reviewed phone build to internal testing; never invoke the joint publisher."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
from urllib.parse import quote

from crewwatch_internal import api, collect_live_codes, next_version_code, play_session, run
from validate import validate_manifest

SOURCE_SHA = '253abd79eb80ed4b0ded4ffbe8425ede9e8d5327'
PACKAGE = 'com.crewcheck.app'
POLICY = Path('scripts/android-play/release-policy.json')
ALIASES = ('qa', 'internal')
REQUIRED_CI = {'Watch phone sync bridge', 'Android signed store bundles', 'CrewCheck web validation'}


def guard():
    assert os.environ.get('GITHUB_REF') == 'refs/heads/main', 'Controller must be on main'
    assert os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch', 'Manual dispatch only'
    assert run(['git', 'rev-parse', 'HEAD']).strip() == SOURCE_SHA, 'Unreviewed source SHA'


def select_track(tracks):
    matches = [t for t in tracks if t.get('track') in ALIASES]
    assert len(matches) == 1, 'Phone internal track missing or ambiguous'
    track = matches[0]
    assert all(r.get('status') == 'completed' for r in track.get('releases', [])), 'Unfinished internal release; stop for coordination'
    return track


def retained_release(track, code, version_name):
    assert track['track'] in ALIASES, 'Only phone internal testing'
    codes = {str(v) for release in track.get('releases', []) for v in release.get('versionCodes', [])}
    assert str(code) not in codes, 'Version already active'
    return {'track': track['track'], 'releases': [{'name': version_name, 'status': 'completed',
        'versionCodes': sorted(codes | {str(code)}, key=int),
        'releaseNotes': [{'language': 'pt-BR', 'text': 'Teste interno: projeção do portão verificado para o relógio.'}]}]}


def other_tracks(tracks, target):
    return {t['track']: t for t in tracks if t['track'] != target}


def check_ci_runs(runs):
    latest = {}
    for r in runs:
        assert r['head_sha'] == SOURCE_SHA, 'Wrong CI source'
        if r.get('event') != 'pull_request':
            continue
        key = r['workflow_id']
        if key not in latest or r['id'] > latest[key]['id']:
            latest[key] = r
    assert latest, 'Missing independent PR CI'
    assert all(r['status'] == 'completed' and r['conclusion'] in ('success', 'skipped') for r in latest.values()), 'Pending/failed independent CI'
    assert REQUIRED_CI <= {r['name'] for r in latest.values() if r['conclusion'] == 'success'}, 'Required mobile/source gates missing'


def check_ci():
    guard()
    import requests
    session = requests.Session()
    session.headers.update({'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'Accept': 'application/vnd.github+json'})
    base = 'https://api.github.com/repos/bmedeiros1987/crewcheck'
    response = session.get(base + '/pulls/882', timeout=30)
    response.raise_for_status()
    pr = response.json()
    assert pr['head']['sha'] == SOURCE_SHA and pr['head']['repo']['full_name'] == 'bmedeiros1987/crewcheck', 'PR882 head moved'
    runs, page = [], 1
    while True:
        response = session.get(base + '/actions/runs', params={'head_sha': SOURCE_SHA, 'per_page': 100, 'page': page}, timeout=30)
        response.raise_for_status()
        batch = response.json()['workflow_runs']
        runs.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    check_ci_runs(runs)
    print('PASS: exact reviewed PR882 source and independent CI')


def allocate():
    raise AssertionError('Live allocation disabled pending reviewed durable journal integration; do not open a replacement edit')


def allocate_offline_contract():
    # Exercised with fake APIs only. Not exposed by the CLI while durable package
    # reservation/recovery is awaiting a reviewed production backend.
    guard()
    policy = json.loads(POLICY.read_text())
    before = copy.deepcopy(policy)
    spec = policy['artifacts']['app']
    assert spec['package'] == PACKAGE and spec['track'] == 'qa' and spec['watch'] is False
    session = play_session()
    base = f'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE}/edits'
    edit = api(session, 'POST', base, json={})['id']
    url = base + '/' + edit
    try:
        tracks, codes = collect_live_codes(session, url)
        selected = select_track(tracks)
        floor, code = next_version_code(codes, policy['knownMaxVersionCode'][PACKAGE])
        policy['knownMaxVersionCode'][PACKAGE] = floor
        spec['versionCode'] = code
        assert {k: v for k, v in policy['artifacts'].items() if k != 'app'} == {k: v for k, v in before['artifacts'].items() if k != 'app'}
        POLICY.write_text(json.dumps(policy, indent=2) + '\n')
        print(json.dumps({'source': SOURCE_SHA, 'package': PACKAGE, 'track': selected['track'], 'observedMax': floor, 'allocatedCode': code}))
    finally:
        api(session, 'DELETE', url)


def validate(bundletool, output):
    guard()
    policy = json.loads(POLICY.read_text())
    spec = policy['artifacts']['app']
    expected = os.environ.get('EXPECTED_UPLOAD_CERT_SHA256', '').lower()
    assert re.fullmatch('[0-9a-f]{64}', expected) and expected == policy['uploadCertificateSha256'], 'Upload certificate mismatch'
    aab = Path('android-wrapper/app/build/outputs/bundle/release/app-release.aab')
    run(['java', '-jar', bundletool, 'validate', '--bundle=' + str(aab)])
    manifest = run(['java', '-jar', bundletool, 'dump', 'manifest', '--bundle=' + str(aab), '--module=base'])
    validate_manifest(manifest, 'app', policy)
    signature = run(['jarsigner', '-J-Duser.language=en', '-verify', '-verbose', '-certs', str(aab)])
    assert 'jar verified.' in signature and not re.search('jar is unsigned|unsigned entries|not integrity-checked', signature, re.I)
    cert = run(['keytool', '-J-Duser.language=en', '-printcert', '-jarfile', str(aab)])
    found = re.search(r'SHA256:\s*([A-Fa-f0-9:]+)', cert)
    assert found and found[1].replace(':', '').lower() == expected
    out = Path(output)
    out.mkdir(parents=True, exist_ok=True)
    name = f'CrewCheck-app-{spec["versionCode"]}.aab'
    data = aab.read_bytes()
    (out / name).write_bytes(data)
    evidence = dict(module='app', sourceSha=SOURCE_SHA, file=name, sha256=hashlib.sha256(data).hexdigest(), certificateSha256=expected, versionName=policy['versionName'], **spec)
    (out / 'mobile-release.json').write_text(json.dumps(evidence, indent=2) + '\n')
    (out / 'app-manifest.xml').write_text(manifest)
    (out / 'resolved-release-policy.json').write_text(json.dumps(policy, indent=2) + '\n')
    print('PASS: actual signed mobile AAB, manifest, upload certificate and provenance')


def write_receipt(path, receipt, initial=False):
    # Flush intent before the network boundary; updates are atomic on this runner.
    target = path if initial else path.with_suffix('.tmp')
    with target.open('x' if initial else 'w') as stream:
        json.dump(receipt, stream, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    if not initial:
        target.replace(path)


def publish(root, journal=None):
    guard()
    assert os.environ.get('PUBLISH_MOBILE_INTERNAL') == 'true', 'Explicit publication opt-in required'
    assert journal is not None, 'Publication disabled: reviewed durable receipt backend is not configured'
    assert journal.package == PACKAGE, 'Journal must reserve the entire shared mobile/Wear package'
    check_ci()
    out = Path(root)
    receipt_path = out / 'mobile-commit-receipt.json'
    assert not receipt_path.exists(), 'Prior commit intent exists; reconcile it before any retry'
    evidence = json.loads((out / 'mobile-release.json').read_text())
    policy = json.loads((out / 'resolved-release-policy.json').read_text())
    spec = policy['artifacts']['app']
    assert evidence['sourceSha'] == SOURCE_SHA and evidence['module'] == 'app'
    assert evidence['package'] == spec['package'] == PACKAGE
    assert evidence['track'] == spec['track'] == 'qa' and evidence['watch'] is False
    assert evidence['versionName'] == policy['versionName'] and evidence['versionCode'] == spec['versionCode']
    assert evidence['certificateSha256'] == policy['uploadCertificateSha256']
    assert Path(evidence['file']).name == evidence['file']
    aab = out / evidence['file']
    assert hashlib.sha256(aab.read_bytes()).hexdigest() == evidence['sha256']
    # Reserve the whole shared package before opening any edit. A crash, uncertain
    # reservation or prior owner must block every fresh runner, allocation included.
    journal.reserve(dict(sourceSha=SOURCE_SHA, package=PACKAGE,
        versionCode=evidence['versionCode'], sha256=evidence['sha256']))
    session = play_session()
    base = f'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE}/edits'
    edit = api(session, 'POST', base, json={})['id']
    url, commit_attempted = base + '/' + edit, False
    commit_error = None
    try:
        journal.persist(dict(sourceSha=SOURCE_SHA, package=PACKAGE, editId=edit,
                             versionCode=evidence['versionCode'], state='edit_open'))
        tracks, codes = collect_live_codes(session, url)
        assert evidence['versionCode'] > max(codes + [policy['knownMaxVersionCode'][PACKAGE]]), 'Version raced another release; rebuild with fresh allocation'
        track = select_track(tracks)
        payload = retained_release(track, evidence['versionCode'], evidence['versionName'])
        upload = f'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/{PACKAGE}/edits/{edit}/bundles?uploadType=media'
        with aab.open('rb') as stream:
            uploaded = api(session, 'POST', upload, data=stream, headers={'Content-Type': 'application/octet-stream'})
        assert int(uploaded['versionCode']) == evidence['versionCode']
        target = url + '/tracks/' + quote(track['track'], safe='')
        api(session, 'PUT', target, json=payload)
        staged = api(session, 'GET', url + '/tracks')['tracks']
        assert other_tracks(staged, track['track']) == other_tracks(tracks, track['track']), 'Non-mobile track changed'
        assert {str(v) for r in select_track(staged)['releases'] for v in r['versionCodes']} == set(payload['releases'][0]['versionCodes']), 'Retained versions mismatch'
        # Preserve both in-review work and ambiguous commit outcomes. Never retry
        # commit, switch review mode, or delete the release edit after this boundary.
        receipt = dict(sourceSha=SOURCE_SHA, package=PACKAGE, editId=edit,
            versionCode=evidence['versionCode'], sha256=evidence['sha256'],
            track=track['track'], expectedTrack=payload,
            otherTracksBefore=other_tracks(tracks, track['track']),
            committed=None, acknowledged=False, verified=False, state='pending')
        write_receipt(receipt_path, receipt, initial=True)
        journal.persist(receipt)
        commit_attempted = True
        try:
            api(session, 'POST', url + ':commit', params={
                'changesNotSentForReview': 'true',
                'changesInReviewBehavior': 'ERROR_IF_IN_REVIEW',
            })
        except Exception as error:
            commit_error = error
            receipt.update(state='unknown', errorType=type(error).__name__)
        else:
            receipt.update(committed=True, acknowledged=True, state='acknowledged')
        write_receipt(receipt_path, receipt)
        journal.persist(receipt)
    finally:
        if not commit_attempted:
            api(session, 'DELETE', url)
    if commit_error is not None:
        # Opening another edit would invalidate an uncommitted original edit.
        # Collect only read-only release summaries; their bounded listing is
        # evidence for reconciliation, not proof of complete live track parity.
        receipt['releaseSummaries'] = {}
        for known_track in tracks:
            name = known_track['track']
            releases_url = f'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE}/tracks/{quote(name, safe="")}/releases'
            try:
                receipt['releaseSummaries'][name] = api(session, 'GET', releases_url)
            except Exception as error:
                receipt['releaseSummaries'][name] = {'readErrorType': type(error).__name__}
        receipt.update(state='reconciliation_required', verified=False)
        write_receipt(receipt_path, receipt)
        journal.persist(receipt)
        raise RuntimeError('Commit response uncertain; read-only evidence saved. Coordinate reconciliation before retry; original edit was not replaced or deleted') from commit_error
    # Acknowledgement permits a new edit to verify the complete track snapshot.
    verify_url = None
    try:
        verify_id = api(session, 'POST', base, json={})['id']
        verify_url = base + '/' + verify_id
        final = api(session, 'GET', verify_url + '/tracks')['tracks']
        receipt['observedTracks'] = final
        assert other_tracks(final, track['track']) == other_tracks(tracks, track['track']), 'Post-commit other-track drift'
        current = select_track(final)
        assert {str(v) for r in current['releases'] for v in r['versionCodes']} == set(payload['releases'][0]['versionCodes']), 'Target track not reconciled'
        receipt.update(committed=True, verified=True, state='reconciled')
        write_receipt(receipt_path, receipt)
        journal.persist(receipt)
        result = dict(evidence, committed=True, commitAcknowledged=receipt['acknowledged'], verifiedTrack=track['track'], retainedVersionCodes=payload['releases'][0]['versionCodes'], testUrl='https://play.google.com/apps/testing/' + PACKAGE, testerEligibility='Not verified; existing tester access only')
        (out / 'mobile-internal-result.json').write_text(json.dumps(result, indent=2) + '\n')
        print(json.dumps(result))
    except Exception as error:
        receipt.update(state='reconciliation_required', verified=False, reconciliationErrorType=type(error).__name__)
        write_receipt(receipt_path, receipt)
        journal.persist(receipt)
        raise RuntimeError('Commit outcome requires coordination; preserve evidence, do not retry or roll back automatically') from (commit_error or error)
    finally:
        if verify_url:
            api(session, 'DELETE', verify_url)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['check-ci', 'allocate', 'validate', 'publish'])
    parser.add_argument('--bundletool')
    parser.add_argument('--output')
    args = parser.parse_args()
    if args.command == 'check-ci': check_ci()
    elif args.command == 'allocate': allocate()
    elif args.command == 'validate': validate(args.bundletool, args.output)
    else: publish(args.output)

if __name__ == '__main__':
    main()
