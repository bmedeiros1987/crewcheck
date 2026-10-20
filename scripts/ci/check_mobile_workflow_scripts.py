"""Offline gate for literal tracked script commands in the reviewed mobile workflow."""
import re
import subprocess
from pathlib import Path, PurePosixPath
WORKFLOW = '.github/workflows/mobile-only-internal.yml'
REQUIRED = ('scripts/regression-mobile-watch-publish-cadence.mjs',
            'scripts/regression-radar-departure-gate-contract.mjs',
            'scripts/regression-radar-departure-gate-arrival-fallback.mjs',
            'scripts/regression-watch-first-sync.mjs',
            'scripts/regression-radar-occurrence-identity.mjs')
COMMAND = re.compile(r'\b(?:node|python3?)\s+[\"\']?((?:\.\./control/)?scripts/[A-Za-z0-9_./-]+\.(?:mjs|cjs|js|py))[\"\']?')
def references(text):
    # Only YAML run scalars/blocks; path filters and action names are not commands.
    lines = text.splitlines(); commands = []; i = 0
    while i < len(lines):
        m = re.match(r'^(\s*)(?:-\s+)?run:\s*(.*)$', lines[i])
        if not m: i += 1; continue
        indent = len(m[1]); value = m[2]; i += 1
        if value in ('|', '>', '|-', '>-'):
            block = []
            while i < len(lines) and (not lines[i].strip() or len(lines[i]) - len(lines[i].lstrip()) > indent):
                block.append(lines[i]); i += 1
            value = '\n'.join(block)
        commands.extend(COMMAND.findall(value))
    return {str(PurePosixPath(p.removeprefix('../control/'))) for p in commands}
def validate(text, tracked, root, required=REQUIRED):
    refs = references(text)
    missing = sorted(p for p in refs if p not in tracked or not (root / p).is_file())
    absent_checks = sorted(set(required) - refs)
    if missing or absent_checks: raise ValueError(f'Workflow scripts unavailable/untracked: {missing}; required checks absent: {absent_checks}')
    return refs
def main():
    root = Path(__file__).resolve().parents[2]
    tracked = set(subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0'))
    refs = validate((root / WORKFLOW).read_text(), tracked, root)
    print(f'PASS {WORKFLOW}: {len(refs)} literal script references exist and are tracked; required offline checks retained')
if __name__ == '__main__': main()
