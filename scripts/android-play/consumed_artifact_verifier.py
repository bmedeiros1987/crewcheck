"""Inactive host adapter over the existing consumed-byte validator, no publisher.

Expected certificate and tool paths are host-owned, never archive/request flags.
No CLI, credentials, service, or network implementation is introduced.
"""
from pathlib import Path
import re
from artifact_consumer import consume
from consumed_validation import validate_consumed


def verify_consumed_artifacts(archive, *, archive_sha256, source_sha, controller_sha,
                              run_id, expected_certificate, tools):
    assert re.fullmatch('[0-9a-f]{64}', expected_certificate)
    assert set(tools) == {'java', 'bundletool', 'jarsigner', 'keytool', 'apkanalyzer', 'apksigner'}
    pinned = {}
    for name, path in tools.items():
        path = Path(path)
        assert path.is_absolute() and path.is_file(), 'Trusted absolute tool file required'
        pinned[name] = str(path.resolve())
    provenance = dict(archive_sha256=archive_sha256, source_sha=source_sha,
                      controller_sha=controller_sha, run_id=run_id)
    # Validate the host-pinned signer BEFORE tools; archive policy alone is not trust.
    consumed = consume(archive, **provenance)
    assert consumed['policy']['uploadCertificateSha256'] == expected_certificate
    receipt = validate_consumed(archive, tools=pinned, **provenance)
    assert receipt['certificateSha256'] == expected_certificate
    return dict(**receipt, outputs=consumed['outputs'])
