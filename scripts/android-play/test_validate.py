import copy
import json
import unittest
from pathlib import Path
from validate import validate_manifest

POLICY = json.loads(Path('scripts/android-play/release-policy.json').read_text())

def manifest(module='app'):
    spec = POLICY['artifacts'][module]
    watch = '<uses-feature android:name="android.hardware.type.watch" android:required="true"/>' if spec['watch'] else ''
    face = '<property android:name="com.google.wear.watchface.format.version" android:value="1"/>' if module == 'watchface' else ''
    return f'''<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="{spec['package']}" android:versionCode="{spec['versionCode']}" android:versionName="{POLICY['versionName']}{'' if module == 'app' else '-' + module}">
    <uses-sdk android:minSdkVersion="{spec['minSdk']}" android:targetSdkVersion="36"/>{watch}<application android:hasCode="false">{face}</application></manifest>'''

class GateTests(unittest.TestCase):
    def test_valid_artifacts(self):
        for module in POLICY['artifacts']:
            validate_manifest(manifest(module), module, POLICY)

    def test_mobile_rejects_watch(self):
        with self.assertRaises(AssertionError):
            validate_manifest(manifest().replace('<application', '<uses-feature android:name="android.hardware.type.watch" android:required="false"/><application'), 'app', POLICY)

    def test_health_permissions_rejected(self):
        for permission in ['READ_SLEEP', 'READ_STEPS', 'WRITE_STEPS', 'READ_HEALTH_DATA_IN_BACKGROUND']:
            with self.assertRaises(AssertionError):
                validate_manifest(manifest().replace('<application', f'<uses-permission android:name="android.permission.health.{permission}"/><application'), 'app', POLICY)

    def test_package_sdk_version_and_watch_required(self):
        for old, new in [('com.crewcheck.app', 'com.wrong.app'), (str(POLICY['artifacts']['app']['versionCode']), '140387'), ('Version="36"', 'Version="35"')]:
            with self.assertRaises(AssertionError):
                validate_manifest(manifest().replace(old, new), 'app', POLICY)
        with self.assertRaises(AssertionError):
            validate_manifest(manifest('wear').replace('required="true"', 'required="false"'), 'wear', POLICY)

    def test_wear_rejects_portrait_filter(self):
        for orientation in ('portrait', 'sensorPortrait', 'reversePortrait', '1', '7', '9'):
            with self.subTest(orientation=orientation), self.assertRaisesRegex(AssertionError, 'portrait orientation'):
                xml = manifest('wear').replace('</application>', f'<activity android:screenOrientation="{orientation}"/></application>')
                validate_manifest(xml, 'wear', POLICY)
        for required in ('', ' android:required="true"'):
            with self.subTest(required=required), self.assertRaisesRegex(AssertionError, 'portrait feature'):
                xml = manifest('wear').replace('<application', f'<uses-feature android:name="android.hardware.screen.portrait"{required}/><application')
                validate_manifest(xml, 'wear', POLICY)

    def test_optional_wear_feature_and_mobile_orientation_are_allowed(self):
        optional = manifest('wear').replace('<application', '<uses-feature android:name="android.hardware.screen.portrait" android:required="false"/><application')
        validate_manifest(optional, 'wear', POLICY)
        mobile = manifest().replace('</application>', '<activity android:screenOrientation="portrait"/></application>')
        validate_manifest(mobile, 'app', POLICY)

    def test_track_and_existing_code(self):
        for change in ['track', 'floor']:
            p = copy.deepcopy(POLICY)
            if change == 'track': p['artifacts']['wear']['track'] = 'production'
            else: p['knownMaxVersionCode']['com.crewcheck.app'] = POLICY['artifacts']['wear']['versionCode']
            with self.assertRaises(AssertionError): validate_manifest(manifest('wear'), 'wear', p)

if __name__ == '__main__': unittest.main()
