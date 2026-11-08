"""Guard the common APT remediation at every existing Playwright OS-deps caller."""
from pathlib import Path
import re

def supported_browser_runner(job):
    runners = re.findall(r'(?m)^    runs-on: ([^\n]+)$', job)
    return len(runners) == 1 and runners[0] in {'ubuntu-latest', 'ubuntu-24.04'}


for label in ['ubuntu-latest', 'ubuntu-24.04']:
    assert supported_browser_runner('    runs-on: ' + label + '\n'), label
for label in ['ubuntu-26.04', 'windows-latest', 'self-hosted', '[self-hosted, linux]', '']:
    assert not supported_browser_runner('    runs-on: ' + label + '\n'), label
assert not supported_browser_runner('    runs-on: ubuntu-latest\n    runs-on: ubuntu-24.04\n')

count = 0
for workflow in Path('.github/workflows').glob('*.yml'):
    text = workflow.read_text(encoding='utf-8')
    if 'install --with-deps' not in text:
        continue
    jobs = re.split(r'(?m)^  [A-Za-z0-9_-]+:\s*$', text.split('\njobs:\n', 1)[1])
    for job in jobs:
        if 'install --with-deps' not in job:
            continue
        count += 1
        assert supported_browser_runner(job), workflow
        first_install = job.index('install --with-deps')
        setup = job.index('name: Prefer Ubuntu archive for browser system dependencies')
        assert setup < first_install, workflow
        assert 'python3 scripts/ci/test-prefer-ubuntu-archive.py' in job[:first_install], workflow
        assert 'sudo install -m 644 "$RUNNER_TEMP/browser-apt-mirrors.txt" /etc/apt/apt-mirrors.txt' in job[:first_install], workflow
    if '  pull_request:' in text and '    paths:' in text.split('  workflow_dispatch:', 1)[0]:
        paths = text.split('    paths:\n', 1)[1].split('  workflow_dispatch:', 1)[0]
        for script in ['prefer-ubuntu-archive.py', 'test-prefer-ubuntu-archive.py', 'test-browser-mirror-coverage.py']:
            assert "      - 'scripts/ci/" + script + "'" in paths, (workflow, script)
assert count, 'No browser dependency callers found'
print('PASS common mirror guard covers', count, 'existing browser jobs; helper/test paths covered')
