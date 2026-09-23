import re
from pathlib import Path

source = Path('scripts/android-play/publish.py').read_text(encoding='utf-8')
review_policy = Path('scripts/android-play/review_policy.py').read_text(encoding='utf-8')
workflow = Path('.github/workflows/android.yml').read_text(encoding='utf-8')

assert "assert item['track'] in ['qa', 'wear:qa']" in source
assert "'status': 'completed'" in source
assert "'status': 'draft'" not in source
assert "'releaseNotes':" in source

# Google Play may require edits to be committed without automatically sending them
# for review. Keep that behavior centralized and explicit while preserving the
# internal-only publication policy.
assert "from review_policy import commit_without_sending_for_review" in source
assert "commit_without_sending_for_review(api, url)" in source
assert "url + ':validate'" not in source
assert "url + ':commit'" not in source
assert "changesNotSentForReview" not in source
assert "edit_url + ':commit'" in review_policy
assert "params={'changesNotSentForReview': 'true'}" in review_policy

assert "Independent CI failed; Play publication blocked" in source
assert "time.time() + 12 * 60" in source

# The Priority 0 release gate is downstream of this Android workflow. Treating it as
# independent CI creates a publication deadlock: publisher waits for the gate while
# the gate waits for the Android workflow (including the publisher) to succeed.
assert "CrewCheck Priority 0 Release Gate" in source
assert "dependent_ci_workflow_names" in source

# Guard against accidentally introducing a production track in any release payload.
payload_tracks = re.findall(r"\['([^']+)'\]", source)
assert "production" not in payload_tracks

print('[android-play] internal auto-release policy OK')


assert "github.event_name == 'push'" in workflow
assert "vars.PLAY_INTERNAL_AUTO_PUBLISH" not in workflow
assert "PLAY_SERVICE_ACCOUNT_JSON" in workflow
