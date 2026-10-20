// Trusted disposable CI only. Never replay the full legacy chain on prepared output.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {prepareCiValidation} from './staged-build-adapter.mjs';

export function createRawLifecycle({repository, commit, job, policy = {allowVersionedEnvTemplate: true}, dependencyRoot}) {
  repository = fs.realpathSync(repository); job = fs.realpathSync(job);
  assert.match(commit, /^[a-f0-9]{40}$/);
  assert(job !== repository && !job.startsWith(repository + path.sep) && !repository.startsWith(job + path.sep));
  const root = fs.mkdtempSync(path.join(job, 'raw-lifecycle-'));
  const raw = path.join(root, 'raw'); fs.mkdirSync(raw);
  const archive = spawnSync('git', ['archive', commit], {cwd: repository, maxBuffer: 256 * 1024 * 1024});
  assert.equal(archive.status, 0);
  assert.equal(spawnSync('tar', ['-x', '-C', raw], {input: archive.stdout}).status, 0);
  const git = args => {
    const r = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {cwd: raw, encoding: 'utf8', env: {PATH: process.env.PATH, HOME: root}});
    assert.equal(r.status, 0, r.stderr); return r.stdout.trim();
  };
  git(['init']);
  const revision = () => {
    git(['add', '.']);
    git(['-c', 'user.name=Synthetic CI', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'attested disposable source revision']);
    return git(['rev-parse', 'HEAD']);
  };
  let current = revision();
  const prepare = () => prepareCiValidation({repository: raw, commit: current, inputRoot: raw, inputKind: 'raw',
    storage: path.join(root, 'store'), validationParent: root, policy, dependencyRoot});
  return {root, raw, prepare, revise(file, transform) {
    assert(typeof file === 'string' && !path.isAbsolute(file) && !file.split('/').some(p => !p || p === '..' || p.startsWith('.')));
    const target = path.join(raw, file); assert(fs.lstatSync(target).isFile());
    const before = fs.readFileSync(target, 'utf8'), after = transform(before);
    assert(typeof after === 'string' && after !== before, 'Invalidation requires an actual source change');
    fs.writeFileSync(target, after); current = revision(); return current;
  }};
}
