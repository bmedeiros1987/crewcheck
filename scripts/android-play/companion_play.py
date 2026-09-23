"""Allocate and publish only the CrewLife Companion to Play Internal Testing."""
import json
import os
import sys
from pathlib import Path
from urllib.parse import quote

import google.auth.transport.requests
from google.oauth2 import service_account
import requests

from credential import load_service_account_secret
from play_error import safe_play_error
from review_policy import commit_internal_edit

PACKAGE = "com.crewcheck.life"
TRACK_ALIASES = ("qa", "internal")
MIN_VERSION_CODE = 101


def session_and_api():
    account = load_service_account_secret(os.environ.get("PLAY_SERVICE_ACCOUNT_JSON"))
    credentials = service_account.Credentials.from_service_account_info(
        account,
        scopes=["https://www.googleapis.com/auth/androidpublisher"],
    )
    session = google.auth.transport.requests.AuthorizedSession(credentials)

    def api(method, url, **kwargs):
        response = session.request(method, url, timeout=300, **kwargs)
        if not response.ok:
            raise RuntimeError(safe_play_error(response))
        return response.json() if response.content else {}

    return session, api


def open_edit(api):
    base = f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE}/edits"
    try:
        edit = api("POST", base, json={})["id"]
    except RuntimeError as error:
        raise RuntimeError(
            f"CrewLife Companion Play app is unavailable to the service account ({PACKAGE}). "
            "Create/authorize the app once in Play Console, then rerun this workflow. "
            f"{error}"
        ) from error
    return base, edit, base + "/" + edit


def live_codes(api, edit_url):
    tracks = api("GET", edit_url + "/tracks").get("tracks", [])
    bundles = api("GET", edit_url + "/bundles").get("bundles", [])
    codes = [int(bundle["versionCode"]) for bundle in bundles]
    codes += [
        int(version)
        for track in tracks
        for release in track.get("releases", [])
        for version in release.get("versionCodes", [])
    ]
    return tracks, codes


def allocate():
    assert os.environ.get("GITHUB_REF") == "refs/heads/main", "Live Play allocation requires main"
    session, api = session_and_api()
    _base, _edit, edit_url = open_edit(api)
    try:
        _tracks, codes = live_codes(api, edit_url)
        next_code = max(codes + [MIN_VERSION_CODE - 1]) + 1
        if next_code >= 2_100_000_000:
            raise RuntimeError("No safe Play versionCode remains for CrewLife Companion")
        version_name = f"1.0.{next_code}"
        env_file = os.environ.get("GITHUB_ENV")
        assert env_file, "GITHUB_ENV is required"
        with open(env_file, "a", encoding="utf-8") as handle:
            handle.write(f"CREWLIFE_VERSION_CODE={next_code}\n")
            handle.write(f"CREWLIFE_VERSION_NAME={version_name}\n")
        print(f"[crewlife-play] allocated {PACKAGE} versionCode={next_code} versionName={version_name}")
    finally:
        session.delete(edit_url, timeout=30)


def publish(root: Path):
    assert os.environ.get("GITHUB_REF") == "refs/heads/main", "Publishing requires main"
    metadata = json.loads((root / "crewlife-play-metadata.json").read_text())
    assert metadata["package"] == PACKAGE
    version_code = int(metadata["versionCode"])
    version_name = str(metadata["versionName"])
    aab = root / metadata["file"]
    assert aab.is_file() and aab.stat().st_size > 0

    session, api = session_and_api()
    base, edit, edit_url = open_edit(api)
    committed = False
    try:
        tracks, codes = live_codes(api, edit_url)
        assert version_code > max(codes + [MIN_VERSION_CODE - 1]), (
            "Version already used or lower than a Play release; rerun allocation and rebuild"
        )
        matches = [track for track in tracks if track.get("track") in TRACK_ALIASES]
        assert len(matches) == 1, (
            "Dedicated internal track missing or ambiguous for CrewLife Companion"
        )
        track = matches[0]
        assert not any(
            release.get("status") in ["draft", "inProgress", "halted"]
            for release in track.get("releases", [])
        ), "Existing unfinished CrewLife internal release: resolve it explicitly in Console first"

        upload_url = (
            f"https://androidpublisher.googleapis.com/upload/androidpublisher/v3/"
            f"applications/{PACKAGE}/edits/{edit}/bundles?uploadType=media"
        )
        with aab.open("rb") as bundle:
            uploaded = api(
                "POST",
                upload_url,
                data=bundle,
                headers={"Content-Type": "application/octet-stream"},
            )
        assert int(uploaded["versionCode"]) == version_code, "Uploaded wrong Companion artifact"

        api(
            "PUT",
            edit_url + "/tracks/" + quote(track["track"], safe=""),
            json={
                "track": track["track"],
                "releases": [{
                    "name": f"CrewLife Companion {version_name}",
                    "versionCodes": [str(version_code)],
                    "status": "completed",
                    "releaseNotes": [{
                        "language": "pt-BR",
                        "text": "CrewLife Companion: integração Samsung Health e conexão local com o CrewCheck aprimoradas.",
                    }],
                }],
            },
        )
        _, review_mode = commit_internal_edit(api, edit_url)
        committed = True
        print(
            f"{PACKAGE}: Companion COMMITTED TO INTERNAL TESTING "
            f"({review_mode}). Production untouched."
        )
    finally:
        if not committed:
            session.delete(edit_url, timeout=30)


def main():
    if len(sys.argv) < 2:
        raise SystemExit("usage: companion_play.py allocate | publish <artifact-dir>")
    command = sys.argv[1]
    if command == "allocate":
        allocate()
        return
    if command == "publish":
        if len(sys.argv) != 3:
            raise SystemExit("publish requires artifact-dir")
        publish(Path(sys.argv[2]))
        return
    raise SystemExit(f"unknown command: {command}")


if __name__ == "__main__":
    main()
