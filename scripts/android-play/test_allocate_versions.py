from pathlib import Path

allocator = Path('scripts/android-play/allocate_versions.py')
assert allocator.is_file(), 'automatic Play version allocator is required'
allocator_source = allocator.read_text(encoding='utf-8')
workflow = Path('.github/workflows/android.yml').read_text(encoding='utf-8')
validate = Path('scripts/android-play/validate.py').read_text(encoding='utf-8')
publish = Path('scripts/android-play/publish.py').read_text(encoding='utf-8')

assert 'def allocate_version_codes(' in allocator_source
assert "knownMaxVersionCode" in allocator_source
assert "versionCode" in allocator_source
assert "2100000000" in allocator_source
assert 'Allocate live Play version codes' in workflow
assert "if: github.ref == 'refs/heads/main'" in workflow
assert 'PLAY_SERVICE_ACCOUNT_JSON' in workflow
assert 'resolved-release-policy.json' in validate
assert 'resolved-release-policy.json' in publish

print('[android-play] automatic live version allocation contract OK')
