import importlib.util
from pathlib import Path

module_path = Path('scripts/android-play/review_policy.py')
assert module_path.is_file(), 'review-safe Play commit helper is required'

spec = importlib.util.spec_from_file_location('review_policy', module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

calls = []
def fake_api(method, url, **kwargs):
    calls.append((method, url, kwargs))
    return {'id': 'edit-1'}

result = module.commit_without_sending_for_review(fake_api, 'https://play.example/edits/edit-1')
assert result == {'id': 'edit-1'}
assert calls == [(
    'POST',
    'https://play.example/edits/edit-1:commit',
    {'params': {'changesNotSentForReview': 'true'}},
)]

publish = Path('scripts/android-play/publish.py').read_text(encoding='utf-8')
assert 'commit_without_sending_for_review' in publish
assert "url + ':validate'" not in publish
assert "url + ':commit'" not in publish
print('[android-play] review-safe Play commit contract OK')
