"""Synthetic archive and controlled tool processes; no real signing/Store claim."""
import hashlib
import io
import json
from pathlib import Path
import tempfile
from unittest.mock import patch
import zipfile
from consumed_artifact_verifier import verify_consumed_artifacts

sha='a'*40
cert='b'*64
policy=json.loads(Path('scripts/android-play/release-policy.json').read_text())
policy['uploadCertificateSha256']=cert
spec=policy['artifacts']['app']
code=spec['versionCode']
manifest=f'''<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.crewcheck.app" android:versionCode="{code}" android:versionName="{policy['versionName']}"><uses-sdk android:minSdkVersion="{spec['minSdk']}" android:targetSdkVersion="{spec['targetSdk']}"/><application android:debuggable="false"/></manifest>'''
data={'aab':b'synthetic-aab','apk':b'synthetic-apk'}
evidence=dict(module='app',package=spec['package'],sourceSha=sha,controllerSha=sha,workflowRunId='123',reviewedSourcePr='4',versionCode=code,versionName=policy['versionName'],certificateSha256=cert,playSubmissionAllowed=False)
for kind in data:
 meta=dict(file=f'CrewCheck-app-{code}.{kind}',sha256=hashlib.sha256(data[kind]).hexdigest(),certificateSha256=cert)
 if kind=='aab':evidence.update(meta)
 else:evidence['apk']=meta
stream=io.BytesIO()
with zipfile.ZipFile(stream,'w') as archive:
 for kind,body in data.items():archive.writestr(f'CrewCheck-app-{code}.{kind}',body)
 for name,body in {'mobile-release.json':json.dumps(evidence),'resolved-release-policy.json':json.dumps(policy),'mobile-source-ci.json':json.dumps({'sourceSha':sha,'sourcePr':'4'}),'app-manifest.xml':'UNTRUSTED ARCHIVED MANIFEST','apk-manifest.xml':'UNTRUSTED ARCHIVED MANIFEST','SHA256SUMS.txt':'UNTRUSTED'}.items():archive.writestr(name,body)
archive=stream.getvalue()
mode='';calls=[]
class Result:
 stderr=''
 returncode=0
 def __init__(self,stdout):self.stdout=stdout
def run(argv,**kwargs):
 assert kwargs['timeout']==120 and 'shell' not in kwargs
 calls.append(argv)
 if 'jarsigner' in argv[0]:return Result('jar is unsigned' if mode=='unsigned' else 'jar verified.')
 if 'keytool' in argv[0]:return Result('SHA256: '+('c'*64 if mode=='cert' else cert))
 if 'apksigner' in argv[0]:return Result('Signer #1 certificate SHA-256 digest: '+cert+('\nSigner #2 certificate SHA-256 digest: '+cert if mode=='multi-signer' else ''))
 if 'dump' in argv or 'apkanalyzer' in argv[0]:return Result(manifest.replace('com.crewcheck.app','wrong.package') if mode=='manifest' else manifest)
 return Result('')
with tempfile.TemporaryDirectory() as directory:
 tools={name:str(Path(directory)/name) for name in ['java','bundletool','jarsigner','keytool','apkanalyzer','apksigner']}
 for name in tools.values():Path(name).write_text('synthetic tool, subprocess controlled in test')
 args=dict(archive_sha256=hashlib.sha256(archive).hexdigest(),source_sha=sha,controller_sha=sha,run_id='123',expected_certificate=cert,tools=tools)
 with patch('consumed_validation.subprocess.run',run):
  result=verify_consumed_artifacts(archive,**args)
  assert result['outputs'][evidence['file']]==data['aab'] and result['storeMutationAllowed'] is False
  assert len(calls)==6
  for mode in ['unsigned','cert','multi-signer','manifest']:
   try:verify_consumed_artifacts(archive,**args);raise RuntimeError('negative accepted')
   except AssertionError:pass
  mode=''
  for change in [{'archive_sha256':'f'*64},{'expected_certificate':'f'*64},{'source_sha':'f'*40}]:
   before=len(calls)
   try:verify_consumed_artifacts(archive,**(args|change));raise RuntimeError('bad archive accepted')
   except AssertionError:pass
   assert len(calls)==before
print('PASS consumed-byte adapter: real command construction over exact archive bytes; controlled synthetic tools reject signer/manifest/archive/provenance errors; no network/build/publish')
