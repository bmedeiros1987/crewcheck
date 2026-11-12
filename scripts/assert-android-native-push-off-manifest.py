"""Check the real signed bundle manifest, not the unmerged app manifest."""
import sys
import xml.etree.ElementTree as ET

root = ET.parse(sys.argv[1]).getroot()
a = '{http://schemas.android.com/apk/res/android}'
expected = {
    'android.permission.INTERNET', 'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION', 'android.permission.POST_NOTIFICATIONS',
    'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WAKE_LOCK',
    'android.permission.SCHEDULE_EXACT_ALARM', 'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    'android.permission.RECEIVE_BOOT_COMPLETED', 'android.permission.ACCESS_NETWORK_STATE',
    'com.android.vending.BILLING', 'com.crewcheck.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
}
actual = {item.get(a+'name') for item in root.findall('uses-permission')}
assert actual == expected, f'Permission set changed: added={actual-expected}, removed={expected-actual}'
app = root.find('application')
for element in app:
    assert element.get(a+'name') not in {
        'com.google.firebase.provider.FirebaseInitProvider',
        'com.google.firebase.iid.FirebaseInstanceIdReceiver',
        'com.google.firebase.messaging.FirebaseMessagingService',
    }, 'Automatic Firebase entrypoint must be absent while OFF'
services = [e for e in app.findall('service') if e.get(a+'name', '').endswith('.CrewCheckFirebaseMessagingService')]
assert len(services) == 1
assert services[0].get(a+'enabled') == 'false' and services[0].get(a+'exported') == 'false'
meta = {e.get(a+'name'): e.get(a+'value') for e in app.findall('meta-data')}
for name in ('firebase_messaging_auto_init_enabled', 'firebase_analytics_collection_enabled', 'firebase_data_collection_default_enabled'):
    assert meta.get(name) == 'false'
print('PASS actual bundle manifest: original permission set, SDK auto-entrypoints absent, native receiver disabled, no automatic collection')
