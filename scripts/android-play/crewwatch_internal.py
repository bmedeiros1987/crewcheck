"""CrewWatch-only Google Play Internal Testing pipeline.

This helper is intentionally narrower than the full Android release:
- package: com.crewcheck.app
- module: wear
- track: wear:qa (or legacy wear:internal when Play exposes that alias)
- never touches production, Mobile qa, or the separate Watch Face package.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path
from urllib.parse import quote

ANDROID = "{http://schemas.android.com/apk/res/android}"
MAX_VERSION_CODE = 2_100_000_000
MODULE = "wear"
PACKAGE = "com.crewcheck.app"
TRACK_ALIASES = ("wear:qa", "wear:internal")
POLICY_PATH = Path("scripts/android-play/release-policy.json")
AAB_PATH = Path("android-wrapper/wear/build/outputs/bundle/release/wear-release.aab")


def next_version_code(live_codes, known_floor):
    values = [int(v) for v in live_codes]
    floor = max(values + [int(known_floor)])
    code = floor + 1
    if code >= MAX_VERSION_CODE:
        raise ValueError("No safe Play versionCode remains for CrewWatch")
    return floor, code


def run(args):
    result = subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if result.returncode:
        raise RuntimeError("Validation command failed: " + args[0] + "\n" + result.stdout[-3000:])
    return result.stdout


def play_session():
    import google.auth.transport.requests
    from google.oauth2 import service_account
    from credential import load_service_account_secret

    account = load_service_account_secret(os.environ["PLAY_SERVICE_ACCOUNT_JSON"])
    credentials = service_account.Credentials.from_service_account_info(
        account,
        scopes=["https://www.googleapis.com/auth/androidpublisher"],
    )
    return google.auth.transport.requests.AuthorizedSession(credentials)


def api(session, method, url, **kwargs):
    from play_error import safe_play_error

    response = session.request(method, url, timeout=300, **kwargs)
    if not response.ok:
        raise RuntimeError(safe_play_error(response))
    return response.json() if response.content else {}


def require_main():
    assert os.environ.get("GITHUB_REF") == "refs/heads/main", (
        "CrewWatch Play publication is allowed only from main"
    )


def collect_live_codes(session, edit_url):
    tracks = api(session, "GET", edit_url + "/tracks").get("tracks", [])
    bundles = api(session, "GET", edit_url + "/bundles").get("bundles", [])
    codes = [int(bundle["versionCode"]) for bundle in bundles]
    codes.extend(
        int(version)
        for track in tracks
        for release in track.get("releases", [])
        for version in release.get("versionCodes", [])
    )
    return tracks, codes


def allocate():
    require_main()
    policy = json.loads(POLICY_PATH.read_text())
    spec = policy["artifacts"][MODULE]
    assert spec["package"] == PACKAGE
    assert spec["track"] == "wear:qa"
    assert spec["watch"] is True

    session = play_session()
    base = f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE}/edits"
    edit_id = api(session, "POST", base, json={})["id"]
    edit_url = base + "/" + edit_id
    try:
        _tracks, live = collect_live_codes(session, edit_url)
        floor, code = next_version_code(
            live,
            policy["knownMaxVersionCode"][PACKAGE],
        )
    finally:
        session.delete(edit_url, timeout=30)

    policy["knownMaxVersionCode"][PACKAGE] = floor
    policy["artifacts"][MODULE]["versionCode"] = code
    POLICY_PATH.write_text(json.dumps(policy, indent=2) + "\n")
    print(f"[crewwatch-play] {PACKAGE} Wear versionCode={code}; live floor={floor}")


def validate(bundletool, output):
    policy = json.loads(POLICY_PATH.read_text())
    spec = policy["artifacts"][MODULE]
    expected_cert = os.environ.get("EXPECTED_UPLOAD_CERT_SHA256", "").replace(":", "").lower()
    assert re.fullmatch(r"[0-9a-f]{64}", expected_cert), "Expected upload certificate is required"
    assert expected_cert == policy["uploadCertificateSha256"], "Unexpected upload certificate"
    assert AAB_PATH.is_file() and AAB_PATH.stat().st_size, "CrewWatch AAB is missing"

    run(["java", "-jar", bundletool, "validate", "--bundle=" + str(AAB_PATH)])
    xml = run([
        "java", "-jar", bundletool, "dump", "manifest",
        "--bundle=" + str(AAB_PATH), "--module=base",
    ])

    import xml.etree.ElementTree as ET
    root = ET.fromstring(xml)
    assert root.get("package") == PACKAGE, "Wrong CrewWatch package"
    code = int(root.get(ANDROID + "versionCode", "0"))
    assert code == int(spec["versionCode"]), "Unexpected CrewWatch versionCode"
    assert int(policy["knownMaxVersionCode"][PACKAGE]) < code < MAX_VERSION_CODE
    assert root.get(ANDROID + "versionName") == policy["versionName"] + "-wear"

    sdk = root.find("uses-sdk")
    assert sdk is not None
    assert int(sdk.get(ANDROID + "minSdkVersion", "0")) == int(spec["minSdk"])
    assert int(sdk.get(ANDROID + "targetSdkVersion", "0")) == int(spec["targetSdk"])

    watch_features = [
        item for item in root.findall("uses-feature")
        if item.get(ANDROID + "name") == "android.hardware.type.watch"
    ]
    assert len(watch_features) == 1
    assert watch_features[0].get(ANDROID + "required", "true") == "true"

    for element in root:
        if element.tag.startswith("uses-permission"):
            name = element.get(ANDROID + "name", "")
            assert not (
                name.startswith("android.permission.health.")
                or "healthdata" in name
                or name in {
                    "android.permission.BODY_SENSORS",
                    "android.permission.BODY_SENSORS_BACKGROUND",
                }
            ), "CrewWatch store AAB must not request health permissions directly"

    app = root.find("application")
    assert app is not None
    assert app.get(ANDROID + "debuggable", "false") == "false"
    assert spec["track"] == "wear:qa"
    assert spec["watch"] is True

    signature = run([
        "jarsigner", "-J-Duser.language=en", "-verify", "-verbose", "-certs", str(AAB_PATH)
    ])
    assert "jar verified." in signature
    assert not re.search(r"jar is unsigned|unsigned entries|not integrity-checked", signature, re.I)

    cert = run(["keytool", "-J-Duser.language=en", "-printcert", "-jarfile", str(AAB_PATH)])
    match = re.search(r"SHA256:\s*([A-Fa-f0-9:]+)", cert)
    assert match
    actual_cert = match.group(1).replace(":", "").lower()
    assert actual_cert == expected_cert

    out = Path(output)
    out.mkdir(parents=True, exist_ok=True)
    filename = f"CrewCheck-wear-{code}.aab"
    data = AAB_PATH.read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    (out / filename).write_bytes(data)
    (out / "wear-manifest.xml").write_text(xml)
    evidence = {
        "module": MODULE,
        "package": PACKAGE,
        "track": "wear:qa",
        "versionCode": code,
        "versionName": policy["versionName"] + "-wear",
        "file": filename,
        "sha256": sha,
        "certificateSha256": expected_cert,
    }
    (out / "crewwatch-release.json").write_text(json.dumps(evidence, indent=2) + "\n")
    (out / "resolved-release-policy.json").write_text(json.dumps(policy, indent=2) + "\n")
    (out / "SHA256SUMS.txt").write_text(f"{sha}  {filename}\n")
    print(f"PASS: CrewWatch signed AAB {code} validated for wear:qa only")


def publish(root):
    require_main()
    from review_policy import commit_internal_edit

    path = Path(root)
    evidence = json.loads((path / "crewwatch-release.json").read_text())
    policy = json.loads((path / "resolved-release-policy.json").read_text())
    spec = policy["artifacts"][MODULE]

    assert evidence["module"] == MODULE
    assert evidence["package"] == PACKAGE == spec["package"]
    assert evidence["track"] == spec["track"] == "wear:qa"
    assert int(evidence["versionCode"]) == int(spec["versionCode"])
    assert evidence["versionName"] == policy["versionName"] + "-wear"
    assert Path(evidence["file"]).name == evidence["file"]
    aab = path / evidence["file"]
    assert hashlib.sha256(aab.read_bytes()).hexdigest() == evidence["sha256"]
    assert evidence["certificateSha256"] == policy["uploadCertificateSha256"]

    session = play_session()
    base = f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE}/edits"
    edit_id = api(session, "POST", base, json={})["id"]
    edit_url = base + "/" + edit_id
    committed = False
    try:
        tracks, live_codes = collect_live_codes(session, edit_url)
        known = max(live_codes + [int(policy["knownMaxVersionCode"][PACKAGE])])
        assert int(evidence["versionCode"]) > known, (
            "CrewWatch versionCode was already used; rerun the workflow to allocate a new code"
        )

        matches = [track for track in tracks if track["track"] in TRACK_ALIASES]
        assert len(matches) == 1, "Dedicated Wear Internal Testing track is missing or ambiguous"
        track = matches[0]
        assert not any(
            release.get("status") in {"draft", "inProgress", "halted"}
            for release in track.get("releases", [])
        ), "Existing unfinished Wear test release must be resolved first"

        upload_url = (
            f"https://androidpublisher.googleapis.com/upload/androidpublisher/v3/"
            f"applications/{PACKAGE}/edits/{edit_id}/bundles?uploadType=media"
        )
        with aab.open("rb") as stream:
            uploaded = api(
                session, "POST", upload_url,
                data=stream,
                headers={"Content-Type": "application/octet-stream"},
            )
        assert int(uploaded["versionCode"]) == int(evidence["versionCode"])

        api(
            session,
            "PUT",
            edit_url + "/tracks/" + quote(track["track"], safe=""),
            json={
                "track": track["track"],
                "releases": [{
                    "name": evidence["versionName"],
                    "versionCodes": [str(evidence["versionCode"])],
                    "status": "completed",
                    "releaseNotes": [{
                        "language": "pt-BR",
                        "text": "CrewWatch · atualização automática para teste interno.",
                    }],
                }],
            },
        )
        _result, review_mode = commit_internal_edit(
            lambda method, url, **kwargs: api(session, method, url, **kwargs),
            edit_url,
        )
        committed = True
        print(
            f"{PACKAGE}: CrewWatch {evidence['versionCode']} COMMITTED TO WEAR INTERNAL TESTING "
            f"({review_mode}). Mobile qa, Watch Face and Production untouched."
        )
    finally:
        if not committed:
            session.delete(edit_url, timeout=30)


def self_test():
    floor, code = next_version_code([144144, 144146, 144145], 144091)
    assert floor == 144146 and code == 144147
    floor, code = next_version_code([], 144200)
    assert floor == 144200 and code == 144201
    assert TRACK_ALIASES == ("wear:qa", "wear:internal")
    assert "production" not in TRACK_ALIASES
    assert MODULE == "wear" and PACKAGE == "com.crewcheck.app"
    print("PASS: CrewWatch-only allocation and track policy")


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("self-test")
    sub.add_parser("allocate")
    validate_cmd = sub.add_parser("validate")
    validate_cmd.add_argument("--bundletool", required=True)
    validate_cmd.add_argument("--output", required=True)
    publish_cmd = sub.add_parser("publish")
    publish_cmd.add_argument("root")

    args = parser.parse_args()
    if args.command == "self-test":
        self_test()
    elif args.command == "allocate":
        allocate()
    elif args.command == "validate":
        validate(args.bundletool, args.output)
    elif args.command == "publish":
        publish(args.root)


if __name__ == "__main__":
    main()
