import importlib.util
import re
from pathlib import Path

source = Path('scripts/android-play/publish.py').read_text(encoding='utf-8')
workflow = Path('.github/workflows/android.yml').read_text(encoding='utf-8')
review_policy_path = Path('scripts/android-play/review_policy.py')

assert "assert item['track'] in ['qa', 'wear:qa']" in source
assert "'status': 'completed'" in source
assert "'status': 'draft'" not in source
assert "'releaseNotes':" in source
assert "url + ':validate'" not in source
assert "from review_policy import commit_for_review_mode" in source
assert "commit_for_review_mode(api, url)" in source
assert "Independent CI failed; Play publication blocked" in source
assert "time.time() + 12 * 60" in source

# Review submission mode is app-specific in Play. The publisher must first use the
# normal commit path, then retry with deferred review only when Play explicitly says
# this app cannot send changes for review automatically.
assert review_policy_path.is_file(), 'per-package Play review policy helper is required'
spec = importlib.util.spec_from_file_location('review_policy', review_policy_path)
review_policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review_policy)

calls = []
def automatic_api(method, url, **kwargs):
    calls.append((method, url, kwargs))
    return {'id': 'automatic'}

mode = review_policy.commit_for_review_mode(automatic_api, 'https://play.example/edits/1')
assert mode == 'automatic'
assert calls == [('POST', 'https://play.example/edits/1:commit', {})]

calls.clear()
def deferred_api(method, url, **kwargs):
    calls.append((method, url, kwargs))
    if len(calls) == 1:
        raise RuntimeError(
            'Play API HTTP 400 | Changes cannot be sent for review automatically. '
            'Please set the query parameter changesNotSentForReview to true.'
        )
    return {'id': 'deferred'}

mode = review_policy.commit_for_review_mode(deferred_api, 'https://play.example/edits/2')
assert mode == 'deferred'
assert calls == [
    ('POST', 'https://play.example/edits/2:commit', {}),
    ('POST', 'https://play.example/edits/2:commit', {'params': {'changesNotSentForReview': 'true'}}),
]

calls.clear()
def unrelated_error_api(method, url, **kwargs):
    calls.append((method, url, kwargs))
    raise RuntimeError('Play API HTTP 400 | unrelated validation failure')

try:
    review_policy.commit_for_review_mode(unrelated_error_api, 'https://play.example/edits/3')
except RuntimeError as error:
    assert 'unrelated validation failure' in str(error)
else:
    raise AssertionError('unrelated Play errors must remain fail-closed')
assert len(calls) == 1

# Guard against accidentally introducing a production track in any release payload.
payload_tracks = re.findall(r"\['([^']+)'\]", source)
assert "production" not in payload_tracks

print('[android-play] per-package internal review policy OK')

# The Priority 0 release gate is downstream of this Android workflow. Treating it as
# independent CI creates a publication deadlock.
assert "CrewCheck Priority 0 Release Gate" in source
assert "dependent_ci_workflow_names" in source
assert "github.event_name == 'push'" in workflow
assert "vars.PLAY_INTERNAL_AUTO_PUBLISH" not in workflow
assert "PLAY_SERVICE_ACCOUNT_JSON" in workflow
