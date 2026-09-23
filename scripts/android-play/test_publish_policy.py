import re
from pathlib import Path

source = Path('scripts/android-play/publish.py').read_text(encoding='utf-8')

assert "assert item['track'] in ['qa', 'wear:qa']" in source
assert "'status': 'completed'" in source
assert "'status': 'draft'" not in source
assert "'releaseNotes':" in source
assert "url + ':commit'" in source
assert "changesNotSentForReview" not in source
assert "Independent CI failed; Play publication blocked" in source
assert "time.time() + 12 * 60" in source

# Guard against accidentally introducing a production track in any release payload.
payload_tracks = re.findall(r"\['([^']+)'\]", source)
assert "production" not in payload_tracks

print('[android-play] internal auto-release policy OK')
