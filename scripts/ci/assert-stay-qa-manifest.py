"""Fail closed if the packaged StayAlarm fixture inherits release reachability."""
import argparse
import re
import xml.etree.ElementTree as ET

ANDROID = '{http://schemas.android.com/apk/res/android}'
PERMISSIONS = {
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.SCHEDULE_EXACT_ALARM',
    'android.permission.RECEIVE_BOOT_COMPLETED',
}
RECOVERY_ACTIONS = {
    'android.intent.action.LOCKED_BOOT_COMPLETED',
    'android.intent.action.BOOT_COMPLETED',
    'android.intent.action.MY_PACKAGE_REPLACED',
    'android.intent.action.TIME_SET',
    'android.intent.action.TIMEZONE_CHANGED',
    'android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED',
}


def verify(root, package):
    if (
        root.tag != 'manifest'
        or not re.fullmatch(r'com\.crewcheck\.app\.stayaccept[0-9]{8,20}r[0-9]{1,5}', package)
        or root.get('package') != package
        or root.get(ANDROID + 'sharedUserId') is not None
    ):
        raise ValueError('Unexpected isolated fixture identity')
    if any(child.tag not in {'uses-sdk', 'uses-permission', 'application', 'uses-feature', 'supports-screens'} for child in root):
        raise ValueError('Unexpected manifest declaration')
    permissions = [node.get(ANDROID + 'name') for node in root.findall('uses-permission')]
    if set(permissions) != PERMISSIONS or len(permissions) != len(PERMISSIONS):
        raise ValueError('Fixture permissions must match the exact offline allowlist')

    apps = root.findall('application')
    if len(apps) != 1:
        raise ValueError('Unexpected application count')
    app = apps[0]
    if (
        app.get(ANDROID + 'name') is not None
        or app.get(ANDROID + 'backupAgent') is not None
        or app.get(ANDROID + 'process') is not None
        or app.get(ANDROID + 'allowBackup') != 'false'
        or app.get(ANDROID + 'directBootAware') not in {None, 'false'}
        or app.get(ANDROID + 'defaultToDeviceProtectedStorage') not in {None, 'false'}
        or app.get(ANDROID + 'appComponentFactory') not in {None, 'androidx.core.app.CoreComponentFactory'}
    ):
        raise ValueError('Unexpected application initializer or backup configuration')
    if any(child.tag not in {'activity', 'receiver'} for child in app):
        raise ValueError('Unexpected Android component in offline fixture')
    expected = [
        ('activity', 'StayAlarmPhysicalFixtureActivity', 'true',
         {('action', 'android.intent.action.MAIN'), ('category', 'android.intent.category.LAUNCHER')}),
        ('receiver', 'StayAlarmReceiver', 'false', {('action', value) for value in RECOVERY_ACTIONS}),
    ]
    for tag, name, exported, intents in expected:
        nodes = app.findall(tag)
        if (
            len(nodes) != 1
            or nodes[0].get(ANDROID + 'name') != 'com.crewcheck.app.' + name
            or nodes[0].get(ANDROID + 'exported') != exported
            or nodes[0].get(ANDROID + 'enabled') == 'false'
            or nodes[0].get(ANDROID + 'process') is not None
            or (tag == 'receiver' and nodes[0].get(ANDROID + 'directBootAware') != 'true')
            or (tag == 'activity' and nodes[0].get(ANDROID + 'directBootAware') not in {None, 'false'})
        ):
            raise ValueError(f'Unexpected fixture {tag}: {name}')
        filters = list(nodes[0])
        if len(filters) != 1 or filters[0].tag != 'intent-filter':
            raise ValueError(f'Unexpected intent filters: {name}')
        actual = [(entry.tag, entry.get(ANDROID + 'name')) for entry in filters[0]]
        if set(actual) != intents or len(actual) != len(intents):
            raise ValueError(f'Unexpected intent actions: {name}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('manifest')
    parser.add_argument('package')
    args = parser.parse_args()
    verify(ET.parse(args.manifest).getroot(), args.package)
    print('PASS packaged StayAlarm QA manifest: only local alarm permissions and entrypoints')
