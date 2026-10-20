"""Validate consumed phone bytes with existing tools; no rebuild or Play access."""
import hashlib
from pathlib import Path
import re
import subprocess
import tempfile

from artifact_consumer import consume
from validate import validate_manifest


def command(args):
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True, timeout=120, check=False)
    if result.returncode:
        raise RuntimeError('Consumed artifact validation command failed')
    return result.stdout


def validate_consumed(archive, *, tools, runner=command, **provenance):
    # tools is explicit existing tool configuration, never downloaded or inferred.
    required = {'java', 'bundletool', 'jarsigner', 'keytool', 'apkanalyzer', 'apksigner'}
    assert set(tools) == required
    assert all(isinstance(p, str) and Path(p).is_absolute() for p in tools.values())
    consumed = consume(archive, **provenance)
    policy, evidence = consumed['policy'], consumed['evidence']
    certificate = policy['uploadCertificateSha256']
    # Materialize only the two validated flat byte outputs into an isolated temp dir.
    # No archive extraction, build directory, or metadata manifest is trusted here.
    with tempfile.TemporaryDirectory(prefix='crewcheck-consumed-') as directory:
        paths = {}
        for name, data in consumed['outputs'].items():
            path = Path(directory) / name
            path.write_bytes(data)
            paths[path.suffix] = path
        aab, apk = paths['.aab'], paths['.apk']
        runner([tools['java'], '-jar', tools['bundletool'], 'validate', '--bundle=' + str(aab)])
        aab_manifest = runner([tools['java'], '-jar', tools['bundletool'], 'dump', 'manifest', '--bundle=' + str(aab), '--module=base'])
        apk_manifest = runner([tools['apkanalyzer'], 'manifest', 'print', str(apk)])
        for xml in (aab_manifest, apk_manifest):
            validate_manifest(xml, 'app', policy)
        signature = runner([tools['jarsigner'], '-J-Duser.language=en', '-verify', '-verbose', '-certs', str(aab)])
        assert 'jar verified.' in signature and not re.search('jar is unsigned|unsigned entries|not integrity-checked', signature, re.I)
        cert = runner([tools['keytool'], '-J-Duser.language=en', '-printcert', '-jarfile', str(aab)])
        certificates = re.findall(r'SHA256:\s*([A-Fa-f0-9:]+)', cert)
        assert len(certificates) == 1 and certificates[0].replace(':', '').lower() == certificate
        apk_signature = runner([tools['apksigner'], 'verify', '--verbose', '--print-certs', str(apk)])
        signers = re.findall(r'Signer #\d+ certificate SHA-256 digest: ([A-Fa-f0-9:]+)', apk_signature)
        assert len(signers) == 1 and signers[0].replace(':', '').lower() == certificate
        # Check bytes after tools as well; injected runner is a trusted executor seam.
        for name, original in consumed['outputs'].items():
            assert (Path(directory) / name).read_bytes() == original, 'Validation changed artifact bytes'
    intent = {k: evidence[k] for k in ('sourceSha', 'controllerSha', 'versionCode')}
    intent.update(runId=str(evidence['workflowRunId']), artifactSha256=evidence['sha256'])
    return dict(intent=intent, archiveSha256=consumed['archiveSha256'],
                apkSha256=evidence['apk']['sha256'], certificateSha256=certificate,
                manifestSha256=[hashlib.sha256(xml.encode()).hexdigest() for xml in (aab_manifest, apk_manifest)],
                actualBytesValidated=True, storeMutationAllowed=False,
                reservationAllowed=False,
                checksRemaining=['current exact CI/review', 'live all-package allocation',
                                 'authorized durable executor transport', 'all-writer coordination'])
