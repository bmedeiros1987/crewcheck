"""Offline immutable artifact input contract; no build, API, extraction or publishing.

The expected archive digest and provenance must come from independently reviewed
run evidence. This validates byte identity only; manifest/signature tools, live
allocation, durable reservation and publication guards remain separate requirements.
"""
import hashlib
import io
import json
from pathlib import PurePosixPath
import re
import zipfile

MAX_EXPANDED_BYTES = 200 * 1024 * 1024


def consume(archive, *, archive_sha256, source_sha, controller_sha, run_id):
    assert re.fullmatch('[0-9a-f]{64}', archive_sha256), 'Reviewed archive digest required'
    assert hashlib.sha256(archive).hexdigest() == archive_sha256, 'Archive digest mismatch'
    assert all(re.fullmatch('[0-9a-f]{40}', sha) for sha in (source_sha, controller_sha)), 'Immutable source/controller required'
    assert re.fullmatch('[1-9][0-9]*', str(run_id)), 'Exact reviewed run required'
    with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
        entries = bundle.infolist()
        names = [entry.filename for entry in entries]
        assert len(names) == len(set(names)), 'Duplicate archive member'
        assert sum(entry.file_size for entry in entries) <= MAX_EXPANDED_BYTES, 'Artifact exceeds size bound'
        assert all(not entry.is_dir() and PurePosixPath(entry.filename).name == entry.filename
                   and '\\' not in entry.filename and entry.filename not in ('.', '..')
                   for entry in entries), 'Only flat artifact members allowed'
        assert all(not entry.flag_bits & 1 for entry in entries), 'Encrypted artifacts unsupported'
        evidence = json.loads(bundle.read('mobile-release.json'))
        policy = json.loads(bundle.read('resolved-release-policy.json'))
        ci = json.loads(bundle.read('mobile-source-ci.json'))
        assert isinstance(evidence, dict) and isinstance(policy, dict) and isinstance(ci, dict)
        assert evidence['sourceSha'] == ci['sourceSha'] == source_sha, 'Source provenance mismatch'
        assert evidence['controllerSha'] == controller_sha, 'Controller provenance mismatch'
        assert str(evidence['workflowRunId']) == str(run_id), 'Run provenance mismatch'
        assert evidence['module'] == 'app' and evidence['package'] == 'com.crewcheck.app'
        spec = policy['artifacts']['app']
        assert evidence['package'] == spec['package'] and spec['watch'] is False
        assert evidence['versionCode'] == spec['versionCode'] and evidence['versionName'] == policy['versionName']
        assert evidence['certificateSha256'] == policy['uploadCertificateSha256']
        assert evidence['reviewedSourcePr'] == ci['sourcePr'], 'Reviewed PR provenance mismatch'
        outputs = {}
        for kind, metadata in (('aab', evidence), ('apk', evidence['apk'])):
            filename = metadata['file']
            assert filename == f'CrewCheck-app-{spec["versionCode"]}.{kind}', 'Unexpected phone filename'
            data = bundle.read(filename)
            assert hashlib.sha256(data).hexdigest() == metadata['sha256'], 'Artifact bytes changed'
            assert metadata['certificateSha256'] == policy['uploadCertificateSha256']
            outputs[filename] = data
        allowed = set(outputs) | {'mobile-release.json', 'resolved-release-policy.json',
                  'mobile-source-ci.json', 'app-manifest.xml', 'apk-manifest.xml', 'SHA256SUMS.txt'}
        assert set(names) == allowed, 'Incomplete or unexpected artifact set'
        # Even a true flag is not evidence of live allocation or store eligibility.
        assert isinstance(evidence.get('playSubmissionAllowed'), bool), 'Preparation state missing'
        return dict(evidence=evidence, ci=ci, policy=policy, outputs=outputs,
                    archiveSha256=archive_sha256, storeMutationAllowed=False,
                    checksRemaining=['actual manifest/signature validation', 'current exact CI/review',
                                     'durable shared-package reservation', 'live allocation/reconciliation'])


def main():
    import argparse
    from pathlib import Path
    parser = argparse.ArgumentParser(description='Verify reviewed local artifact bytes; no extraction or publication')
    parser.add_argument('--archive', required=True)
    parser.add_argument('--archive-sha256', required=True)
    parser.add_argument('--source-sha', required=True)
    parser.add_argument('--controller-sha', required=True)
    parser.add_argument('--run-id', required=True)
    args = parser.parse_args()
    try:
        result = consume(Path(args.archive).read_bytes(), archive_sha256=args.archive_sha256,
            source_sha=args.source_sha, controller_sha=args.controller_sha, run_id=args.run_id)
        print(json.dumps(dict(archiveSha256=result['archiveSha256'], sourceSha=args.source_sha,
            controllerSha=args.controller_sha, runId=args.run_id, storeMutationAllowed=False,
            outputs=sorted(result['outputs']), checksRemaining=result['checksRemaining'])))
    except Exception as error:
        print('Artifact input unverified: ' + type(error).__name__)
        raise SystemExit(1)


if __name__ == '__main__':
    main()
