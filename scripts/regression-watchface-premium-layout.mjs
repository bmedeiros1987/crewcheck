import { execFileSync } from 'node:child_process';

// XML-aware geometry and privacy checks; Python 3 is preinstalled on the CI runner.
execFileSync('python3', ['scripts/regression-watchface-round-safe.py'], { stdio: 'inherit' });
