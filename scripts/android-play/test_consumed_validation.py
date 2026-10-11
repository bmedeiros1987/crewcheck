"""Synthetic runner checks exact consumed bytes/commands, never signs or calls APIs."""
from pathlib import Path
import test_artifact_consumer as fixture
import consumed_validation as m

fixture.policy['knownMaxVersionCode'] = {'com.crewcheck.app': 144199}
fixture.policy['artifacts']['app'].update(minSdk=26, targetSdk=36, track='qa')
xml='''<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.crewcheck.app" android:versionCode="144200" android:versionName="14.4.11"><uses-sdk android:minSdkVersion="26" android:targetSdkVersion="36"/><application android:debuggable="false"/></manifest>'''
tools={k:'/existing/'+k for k in ['java','bundletool','jarsigner','keytool','apkanalyzer','apksigner']}

def validate(failure=None):
    seen=[]
    def runner(args):
        seen.append(args)
        for arg in args:
            path=arg.removeprefix('--bundle=')
            if path.endswith(('.aab','.apk')):
                assert Path(path).read_bytes() == (b'aab' if path.endswith('.aab') else b'apk')
        if failure=='command': raise RuntimeError('fixture command failed')
        if 'dump' in args or args[0].endswith('apkanalyzer'):
            return xml.replace('144200','144201') if failure=='manifest' else xml
        if args[0].endswith('jarsigner'): return 'jar is unsigned' if failure=='unsigned' else 'jar verified.'
        if args[0].endswith('keytool'): return 'SHA256: '+('0'*64 if failure=='aab-cert' else fixture.certificate)
        if args[0].endswith('apksigner'):
            output='Signer #1 certificate SHA-256 digest: '+fixture.certificate
            if failure=='multiple-signers':output+='\nSigner #2 certificate SHA-256 digest: '+fixture.certificate
            if failure=='changed-bytes':Path(args[-1]).write_bytes(b'changed')
            return output
        return ''
    data=fixture.archive()
    try:
        result=m.validate_consumed(data,tools=tools,runner=runner,archive_sha256=fixture.hashlib.sha256(data).hexdigest(),source_sha=fixture.source,controller_sha=fixture.controller,run_id=fixture.run)
    finally:
        assert all(not Path(arg.removeprefix('--bundle=')).exists() for args in seen for arg in args if arg.endswith(('.apk','.aab')))
    assert result['intent']['artifactSha256']==fixture.evidence['sha256']
    assert result['actualBytesValidated'] is True and result['storeMutationAllowed'] is False and result['reservationAllowed'] is False
    assert len(seen)==6
    assert all(not Path(arg.removeprefix('--bundle=')).exists() for args in seen for arg in args if arg.endswith(('.apk','.aab')))
    return result
validate()
for failure in ['command','manifest','unsigned','aab-cert','multiple-signers','changed-bytes']:
    try:validate(failure)
    except (AssertionError,RuntimeError):pass
    else:raise AssertionError('Unsafe consumed bytes accepted: '+failure)
print('PASS: tools inspect consumed phone bytes; signature/manifest failures and byte mutation block; no rebuild, allocation, journal reservation or Play')
