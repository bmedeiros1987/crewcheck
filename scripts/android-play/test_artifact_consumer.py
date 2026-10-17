"""Synthetic artifact archive: immutable bytes/provenance; no APIs or signing secrets."""
import copy
import hashlib
import io
import json
import zipfile
from unittest.mock import patch
import artifact_consumer as m

source, controller, run = 'a' * 40, 'b' * 40, '123'
certificate = 'c' * 64
policy = dict(versionName='14.4.11', uploadCertificateSha256=certificate,
              artifacts=dict(app=dict(package='com.crewcheck.app', watch=False, versionCode=144200)))
evidence = dict(module='app', sourceSha=source, controllerSha=controller, workflowRunId=run,
    reviewedSourcePr='929', package='com.crewcheck.app', versionCode=144200,
    versionName='14.4.11', certificateSha256=certificate, file='CrewCheck-app-144200.aab',
    sha256=hashlib.sha256(b'aab').hexdigest(), playSubmissionAllowed=False,
    apk=dict(file='CrewCheck-app-144200.apk', sha256=hashlib.sha256(b'apk').hexdigest(),
             certificateSha256=certificate))


def archive(change=None):
    metadata = copy.deepcopy(evidence)
    if change: metadata.update(change)
    entries = {'mobile-release.json': json.dumps(metadata).encode(),
               'resolved-release-policy.json': json.dumps(policy).encode(),
               'mobile-source-ci.json': json.dumps(dict(sourceSha=source, sourcePr='929')).encode(),
               'CrewCheck-app-144200.aab': b'aab', 'CrewCheck-app-144200.apk': b'apk',
               'app-manifest.xml': b'<manifest/>', 'apk-manifest.xml': b'<manifest/>',
               'SHA256SUMS.txt': b'synthetic'}
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as bundle:
        for name, data in entries.items(): bundle.writestr(name, data)
    return buffer.getvalue()


def consume(data, **overrides):
    arguments = dict(archive_sha256=hashlib.sha256(data).hexdigest(), source_sha=source,
                     controller_sha=controller, run_id=run)
    arguments.update(overrides)
    return m.consume(data, **arguments)


def rejects(call):
    try: call()
    except (AssertionError, KeyError, ValueError, zipfile.BadZipFile): return
    raise AssertionError('Unsafe input accepted')


for flag in (False, True):
    result = consume(archive({'playSubmissionAllowed': flag}))
    assert result['outputs']['CrewCheck-app-144200.aab'] == b'aab'
    assert result['storeMutationAllowed'] is False
for override in ({'archive_sha256': '0' * 64}, {'source_sha': '0' * 40},
                 {'controller_sha': '0' * 40}, {'run_id': '124'}):
    rejects(lambda: consume(archive(), **override))
for change in ({'sha256': '0' * 64}, {'file': '../CrewCheck-app-144200.aab'},
               {'versionCode': 144201}, {'package': 'com.crewcheck.watch.app'},
               {'certificateSha256': '0' * 64}, {'playSubmissionAllowed': None}):
    rejects(lambda: consume(archive(change)))
for name in ('../escape', '/absolute', 'nested/member', 'unexpected.json'):
    buffer = io.BytesIO(archive())
    with zipfile.ZipFile(buffer, 'a') as bundle: bundle.writestr(name, b'no')
    rejects(lambda: consume(buffer.getvalue()))
with patch.object(m, 'MAX_EXPANDED_BYTES', 1): rejects(lambda: consume(archive()))
print('PASS: approved archive/source/controller/run/phone bytes bound; malformed input rejected; no rebuild, extraction or store mutation')
