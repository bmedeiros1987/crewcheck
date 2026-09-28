import importlib.util
from pathlib import Path

path = Path('scripts/android-play/review_policy.py')
spec = importlib.util.spec_from_file_location('review_policy', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

calls = []
def deferred_api(method, url, **kwargs):
    calls.append((method, url, kwargs))
    return {'ok': True}

result, mode = module.commit_internal_edit(deferred_api, 'https://play.example/edit/1')
assert result == {'ok': True}
assert mode == 'deferred-review'
assert calls == [(
    'POST',
    'https://play.example/edit/1:commit',
    {'params': {'changesNotSentForReview': 'true'}},
)]

calls = []
def automatic_api(method, url, **kwargs):
    calls.append((method, url, kwargs))
    if kwargs.get('params') == {'changesNotSentForReview': 'true'}:
        raise RuntimeError(
            'Play API HTTP 400 | Changes are sent for review automatically. '
            'The query parameter changesNotSentForReview must not be set.'
        )
    return {'ok': True}

result, mode = module.commit_internal_edit(automatic_api, 'https://play.example/edit/2')
assert result == {'ok': True}
assert mode == 'automatic-review'
assert calls == [
    ('POST', 'https://play.example/edit/2:commit', {'params': {'changesNotSentForReview': 'true'}}),
    ('POST', 'https://play.example/edit/2:commit', {}),
]

calls = []
def unrelated_failure(method, url, **kwargs):
    calls.append((method, url, kwargs))
    raise RuntimeError('Play API HTTP 400 | unrelated policy failure')

try:
    module.commit_internal_edit(unrelated_failure, 'https://play.example/edit/3')
    raise AssertionError('unrelated Play failures must not be retried')
except RuntimeError as error:
    assert 'unrelated policy failure' in str(error)
assert len(calls) == 1

print('[android-play] package-aware review mode contract OK')
