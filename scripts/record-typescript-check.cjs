const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const directory = path.resolve(process.env.UI_COMMAND_EVIDENCE_DIR || 'artifacts/brand-footer');
fs.mkdirSync(directory, { recursive: true });
const command = ['npx', 'tsc', '--noEmit'];
const startedAt = new Date().toISOString();
const result = spawnSync(command[0], command.slice(1), { encoding: 'utf8' });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
fs.writeFileSync(path.join(directory, 'typescript-command.json'), JSON.stringify({
  command, startedAt, completedAt: new Date().toISOString(),
  testedCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  exitCode: result.status, signal: result.signal,
  error: result.error?.message || null,
}, null, 2));
process.exitCode = result.status ?? 1;
