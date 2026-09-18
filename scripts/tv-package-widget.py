"""Create an explicitly unsigned demo container, not a Samsung-certified package."""
import json
import pathlib
import xml.etree.ElementTree as ET
import zipfile

source = pathlib.Path("dist/samsung-tizen")
metadata = json.loads((source / "tv-build.json").read_text())
assert metadata["demo"] is True, "This CI packaging path accepts demo assets only"
root = ET.parse(source / "config.xml").getroot()
ns = {"w": "http://www.w3.org/ns/widgets", "t": "http://tizen.org/ns/widgets"}
assert root.find("t:application", ns).attrib["id"] == "CrewChkDm1.Player"
assert root.find("w:content", ns).attrib["src"] == "index.html"
assert (source / "index.html").is_file()
target = pathlib.Path("dist/tv-packages/samsung/CrewCheck-TV-DEMO-UNSIGNED.wgt")
target.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(source.rglob("*")):
        assert not file.is_symlink(), "Do not package symlinks"
        if file.is_file():
            name = file.relative_to(source).as_posix()
            assert name not in ("author-signature.xml", "signature1.xml")
            entry = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, file.read_bytes())
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    assert {"config.xml", "index.html", "icon.png", "tv-build.json"} <= set(archive.namelist())
print(f"Created {target}: UNSIGNED, NOT INSTALLABLE until Samsung signing and validation.")
