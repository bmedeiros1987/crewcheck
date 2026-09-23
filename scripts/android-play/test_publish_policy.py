import re
from pathlib import Path

source = Path('scripts/android-play/publish.py').read_text(encoding='utf-8')
review_policy = Path('scripts/android-play/review_policy.py').read_text(encoding='utf-8')
workflow = Path('.github/workflows/android.yml').read_text(encoding='utf-8')

assert "assert item['track'] in ['qa', 'wear:qa']" in source
assert "'status': 'completed'" in source
assert "'status': 'draft'" not in source
assert "'releaseNotes':" in source
assert "url + ':validate'" not in source
assert "from review_policy import commit_internal_edit" in source
assert "commit_internal_edit(api, url)" in source
assert "url + ':commit'" not in source
assert "params={'changesNotSentForReview': 'true'}" in review_policy
assert "MUST_NOT_DEFER_REVIEW" in review_policy
assert "api('POST', edit_url + ':commit')" in review_policy
assert "Independent CI failed; Play publication blocked" in source
assert "time.time() + 12 * 60" in source

# Only workflows created by the main-branch push are independent release evidence.
# The same commit can later receive issue_comment/audit runs; allowing those into the
# gate caused an unrelated audit failure to block an otherwise green internal release.
assert "if run.get('event') != 'push':" in source
assert "No independent main-push CI evidence for this commit" in source
assert "issue_comment" in source
assert "dependent_ci_workflow_names" not in source

# Guard against accidentally introducing a production track in any release payload.
payload_tracks = re.findall(r"\['([^']+)'\]", source)
assert "production" not in payload_tracks

print('[android-play] internal auto-release policy OK')

assert "github.event_name == 'push'" in workflow
assert "vars.PLAY_INTERNAL_AUTO_PUBLISH" not in workflow
assert "PLAY_SERVICE_ACCOUNT_JSON" in workflow
