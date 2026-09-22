"""Fail closed on the actual signed AAB, never only on source Gradle files."""
import argparse
import hashlib
import json
import os
import re
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path

ANDROID = '{http://schemas.android.com/apk/res/android}'

def validate_manifest(xml, module, policy):
    root = ET.fromstring(xml)
    spec = policy['artifacts'][module]
    assert root.get('package') == spec['package'], 'Wrong package ID'
    code = int(root.get(ANDROID + 'versionCode', '0'))
    assert code == spec['versionCode'], 'Unexpected versionCode'
    assert policy['knownMaxVersionCode'][spec['package']] < code < 2100000000, 'Version code cannot upgrade known releases'
    expected_name = policy['versionName'] + ('' if module == 'app' else '-' + module)
    assert root.get(ANDROID + 'versionName') == expected_name, 'Unexpected versionName'
    sdk = root.find('uses-sdk')
    assert sdk is not None, 'Missing SDK declarations'
    assert int(sdk.get(ANDROID + 'minSdkVersion', '0')) == spec['minSdk'], 'Unexpected minSdk'
    assert int(sdk.get(ANDROID + 'targetSdkVersion', '0')) == spec['targetSdk'], 'Target API must be 36'
    watches = [f for f in root.findall('uses-feature') if f.get(ANDROID + 'name') == 'android.hardware.type.watch']
    assert (len(watches) == 1 and watches[0].get(ANDROID + 'required', 'true') == 'true') if spec['watch'] else not watches, 'Wrong watch feature targeting'
    for p in root:
        if p.tag.startswith('uses-permission'):
            name = p.get(ANDROID + 'name', '')
            assert not (name.startswith('android.permission.health.') or 'healthdata' in name or name in ['android.permission.BODY_SENSORS', 'android.permission.BODY_SENSORS_BACKGROUND']), 'Forbidden health permission'
    assert 'HEALTH_PERMISSIONS' not in xml and 'health.ACTION' not in xml and 'com.google.android.apps.healthdata' not in xml, 'Legacy Health Connect declaration'
    app = root.find('application')
    assert app is not None and app.get(ANDROID + 'debuggable', 'false') == 'false', 'Debuggable release'
    if module == 'watchface':
        assert app.get(ANDROID + 'hasCode') == 'false', 'Watch face must be resource-only'
        props = {p.get(ANDROID + 'name'): p.get(ANDROID + 'value') for p in app.findall('property')}
        assert props.get('com.google.wear.watchface.format.version') == '1', 'Unexpected Watch Face Format'
    assert spec['track'] == ('wear:internal' if spec['watch'] else 'internal'), 'Wrong track'
    return spec

def run(args):
    result = subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if result.returncode:
        raise RuntimeError('Validation command failed: ' + args[0] + '\n' + result.stdout[-3000:])
    return result.stdout

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--bundletool', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    policy = json.loads(Path('scripts/android-play/release-policy.json').read_text())
    expected_cert = os.environ.get('EXPECTED_UPLOAD_CERT_SHA256', '').replace(':', '').lower()
    assert re.fullmatch('[0-9a-f]{64}', expected_cert), 'Expected upload certificate is required'
    assert expected_cert == policy['uploadCertificateSha256'], 'Signing key differs from the public upload certificate audited in Play Console'
    report = []
    seen = set()
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    for module, spec in policy['artifacts'].items():
        identity = (spec['package'], spec['versionCode'])
        assert identity not in seen, 'Duplicate code in same package'
        seen.add(identity)
        aab = Path(f'android-wrapper/{module}/build/outputs/bundle/release/{module}-release.aab')
        assert aab.is_file() and aab.stat().st_size, 'Missing AAB: ' + str(aab)
        run(['java', '-jar', args.bundletool, 'validate', '--bundle=' + str(aab)])
        xml = run(['java', '-jar', args.bundletool, 'dump', 'manifest', '--bundle=' + str(aab), '--module=base'])
        validate_manifest(xml, module, policy)
        signature = run(['jarsigner', '-J-Duser.language=en', '-verify', '-verbose', '-certs', str(aab)])
        assert 'jar verified.' in signature, 'AAB signature verification failed'
        assert not re.search('jar is unsigned|unsigned entries|not integrity-checked', signature, re.I), 'Unsigned AAB entries'
        cert = run(['keytool', '-J-Duser.language=en', '-printcert', '-jarfile', str(aab)])
        match = re.search(r'SHA256:\s*([A-Fa-f0-9:]+)', cert)
        assert match and match[1].replace(':', '').lower() == expected_cert, 'Wrong upload certificate'
        name = f'CrewCheck-{module}-{spec["versionCode"]}.aab'
        data = aab.read_bytes()
        (out / name).write_bytes(data)
        (out / (module + '-manifest.xml')).write_text(xml)
        report.append(dict(module=module, file=name, sha256=hashlib.sha256(data).hexdigest(), certificateSha256=expected_cert, **spec))
    (out / 'release-report.json').write_text(json.dumps(report, indent=2) + '\n')
    (out / 'SHA256SUMS.txt').write_text(''.join(f'{r["sha256"]}  {r["file"]}\n' for r in report))
    print('PASS: all three signed bundles match package, SDK, version, permissions and form-factor policy.')

if __name__ == '__main__':
    main()
