import importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('manifest_check',Path(__file__).parent/'android-qa/verify-merged-manifest.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
xml='''<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.crewcheck.app.qacheckpoint"><uses-permission android:name="android.permission.INTERNET"/><application android:testOnly="true" android:debuggable="true" android:allowBackup="false" android:networkSecurityConfig="@xml/checkpoint_network"><activity android:name="com.crewcheck.app.CheckpointQaActivity" android:exported="true"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity></application></manifest>'''
m.verify(xml)
bad=[xml.replace('.qacheckpoint',''),xml.replace('testOnly="true"','testOnly="false"'),xml.replace('allowBackup="false"','allowBackup="true"'),xml.replace('</application>','<service android:name="Unsafe"/></application>'),xml.replace('</application>','<activity android:name="Unsafe"/></application>'),xml.replace('</application>','<activity-alias android:name="Unsafe"/></application>'),xml.replace('</manifest>','<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/></manifest>'),xml.replace('</intent-filter>','<data android:scheme="https"/></intent-filter>')]
for candidate in bad:
    try:m.verify(candidate)
    except ValueError:pass
    else:raise AssertionError('unsafe manifest accepted')
bad_extra=[xml.replace('com.crewcheck.app.CheckpointQaActivity','.CheckpointQaActivity'),xml.replace('exported="true"','exported="false"'),xml.replace('@xml/checkpoint_network','@xml/unsafe')]
for candidate in bad_extra:
    try:m.verify(candidate)
    except ValueError:pass
    else:raise AssertionError('unsafe artifact accepted')
for definition in [
 '<permission android:name="com.crewcheck.app.qacheckpoint.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION" android:protectionLevel="signature"/>',
 '<permission android:name="arbitrary" android:protectionLevel="normal"/>',
 '<permission-group android:name="arbitrary"/>',
 '<permission-tree android:name="arbitrary"/>']:
    try:m.verify(xml.replace('</manifest>',definition+'</manifest>'))
    except ValueError:pass
    else:raise AssertionError('permission definition accepted')
print('PASS QA merged-manifest checker: 1 synthetic valid, 15 unsafe refused; no actual manifest/SDK claim')
