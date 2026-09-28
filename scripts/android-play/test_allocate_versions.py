import importlib.util
from pathlib import Path

allocator = Path('scripts/android-play/allocate_versions.py')
assert allocator.is_file(), 'automatic Play version allocator is required'
spec = importlib.util.spec_from_file_location('allocate_versions', allocator)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

policy = {
    'knownMaxVersionCode': {'com.crewcheck.app': 144091, 'com.crewcheck.watch.app': 144092},
    'artifacts': {
        'app': {'package': 'com.crewcheck.app', 'versionCode': 144100},
        'wear': {'package': 'com.crewcheck.app', 'versionCode': 144101},
        'watchface': {'package': 'com.crewcheck.watch.app', 'versionCode': 144102},
    },
}
resolved = module.allocate_version_codes(
    policy,
    {
        'com.crewcheck.app': [144120, 144121],
        'com.crewcheck.watch.app': [144130],
    },
)
assert resolved['knownMaxVersionCode']['com.crewcheck.app'] == 144121
assert resolved['artifacts']['app']['versionCode'] == 144122
assert resolved['artifacts']['wear']['versionCode'] == 144123
assert resolved['knownMaxVersionCode']['com.crewcheck.watch.app'] == 144130
assert resolved['artifacts']['watchface']['versionCode'] == 144131
assert policy['artifacts']['app']['versionCode'] == 144100, 'allocator must not mutate source policy'

workflow = Path('.github/workflows/android.yml').read_text(encoding='utf-8')
validate = Path('scripts/android-play/validate.py').read_text(encoding='utf-8')
publish = Path('scripts/android-play/publish.py').read_text(encoding='utf-8')

assert 'Allocate live Play version codes' in workflow
assert "if: github.ref == 'refs/heads/main'" in workflow
assert 'PLAY_SERVICE_ACCOUNT_JSON' in workflow
assert 'resolved-release-policy.json' in validate
assert 'resolved-release-policy.json' in publish
assert "Path('scripts/android-play/release-policy.json').read_text()" not in publish

print('[android-play] automatic live version allocation contract OK')
