"""Validate a plain XML merged QA manifest; never builds or installs anything."""
import sys
import xml.etree.ElementTree as E
A='{http://schemas.android.com/apk/res/android}'
def require(condition, message='unsafe manifest'):
    if not condition: raise ValueError(message)
def verify(text):
    root=E.fromstring(text)
    require(root.get('package')=='com.crewcheck.app.qacheckpoint', 'unexpected package')
    require(not any(root.findall(t) for t in ['permission','permission-group','permission-tree']), 'unexpected permission definition')
    permissions=[e.get(A+'name') for e in root.findall('uses-permission')]
    require(permissions==['android.permission.INTERNET'], 'unexpected permissions')
    require(not root.findall('uses-permission-sdk-23'), 'unexpected SDK permissions')
    app=root.find('application')
    require(app is not None)
    require(app.get(A+'testOnly')=='true' and app.get(A+'debuggable')=='true', 'not test-only debug')
    require(app.get(A+'allowBackup')=='false', 'backup enabled')
    require(not any(app.findall(t) for t in ['receiver','service','provider','activity-alias']), 'unexpected component')
    activities=app.findall('activity')
    require(len(activities)==1, 'unexpected activities')
    activity=activities[0]
    require(activity.get(A+'name') == 'com.crewcheck.app.CheckpointQaActivity', 'unexpected launcher')
    require(activity.get(A+'exported')=='true', 'QA launcher not exported')
    require(app.get(A+'networkSecurityConfig')=='@xml/checkpoint_network', 'unexpected network policy')
    filters=activity.findall('intent-filter')
    require(len(filters)==1)
    require([e.get(A+'name') for e in filters[0].findall('action')]==['android.intent.action.MAIN'])
    require([e.get(A+'name') for e in filters[0].findall('category')]==['android.intent.category.LAUNCHER'])
    require(not filters[0].findall('data'), 'unexpected deep link')
if __name__=='__main__':
    verify(open(sys.argv[1],encoding='utf8').read())
    print('PASS merged QA manifest only; no runtime isolation or installation approval')
