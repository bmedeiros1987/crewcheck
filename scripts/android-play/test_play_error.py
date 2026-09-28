import importlib.util
from pathlib import Path

module_path = Path('scripts/android-play/play_error.py')
assert module_path.is_file(), 'sanitized Play API error helper is required'

spec = importlib.util.spec_from_file_location('play_error', module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class Response:
    status_code = 400
    def json(self):
        return {
            'error': {
                'code': 400,
                'message': 'Track wear:qa is not valid for this edit. See https://example.invalid/token?secret=abc',
                'errors': [
                    {'reason': 'invalid', 'message': 'bad edit'},
                    {'reason': 'tracksNotCompatible'},
                ],
            }
        }

summary = module.safe_play_error(Response())
assert 'HTTP 400' in summary
assert 'invalid' in summary
assert 'tracksNotCompatible' in summary
assert 'Track wear:qa is not valid for this edit' in summary
assert 'https://' not in summary
assert 'secret=abc' not in summary
assert len(summary) <= 420

class BrokenResponse:
    status_code = 503
    def json(self):
        raise ValueError('not json')

assert module.safe_play_error(BrokenResponse()) == 'Play API HTTP 503'
print('[android-play] sanitized Play API diagnostics OK')
