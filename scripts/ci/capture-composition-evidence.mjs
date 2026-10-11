// Capture the actual tested merge's Git objects, not a reconstructed approximation.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const [repository, prefixArg, expectedCommit] = process.argv.slice(2);
assert.match(expectedCommit ?? '', /^[a-f0-9]{40}$/);
const prefix = path.resolve(prefixArg);
assert(!fs.existsSync(prefix + '.bundle') && !fs.existsSync(prefix + '.json'), 'Fresh evidence destination required');
const git = args => {const r = spawnSync('git', args, {cwd: repository, maxBuffer: 128 * 1024 * 1024}); assert.equal(r.status, 0, r.stderr?.toString()); return r.stdout;};
const commit = git(['rev-parse', 'HEAD']).toString().trim();
assert.equal(commit, expectedCommit);
const parents = git(['rev-list', '--parents', '-n', '1', commit]).toString().trim().split(' ').slice(1);
assert(parents.length >= 1, 'Versioned commit parents required');
const tree = git(['rev-parse', `${commit}^{tree}`]).toString().trim();
const entries = git(['ls-tree', '-r', '-z', commit]).toString().split('\0').filter(Boolean).map(row => {
  const tab = row.indexOf('\t'), [mode, type, object] = row.slice(0, tab).split(' ');
  return {path: row.slice(tab + 1), mode, type, object};
});
git(['bundle', 'create', prefix + '.bundle', 'HEAD', ...parents.map(parent => '^' + parent)]);
git(['bundle', 'verify', prefix + '.bundle']);
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const evidence = {commit, parents, tree, entries, treeManifestSha256: digest(JSON.stringify(entries)), bundleSha256: digest(fs.readFileSync(prefix + '.bundle')), bundlePrerequisites: parents, scope: 'Exact Git composition captured before required validation; test outcome is recorded separately'};
fs.writeFileSync(prefix + '.json', JSON.stringify(evidence, null, 2) + '\n', {flag: 'wx'});
assert.equal(git(['rev-parse', 'HEAD']).toString().trim(), commit);
console.log(JSON.stringify({commit, parents, tree, treeManifestSha256: evidence.treeManifestSha256, bundleSha256: evidence.bundleSha256}));
