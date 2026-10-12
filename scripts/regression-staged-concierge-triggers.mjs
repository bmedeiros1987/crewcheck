import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync('.github/workflows/concierge-journey-programs.yml', 'utf8');
// Fail closed on changes to this workflow's quoted, block-list path syntax.
const eventPaths = event => {
  const block = source.match(new RegExp(`^  ${event}:\\n([\\s\\S]*?)(?=^  [A-Za-z_]+:|^[^ \\n]|$(?![\\s\\S]))`, 'm'))?.[1];
  assert(block, `Missing ${event} trigger`);
  const lines = block.split('\n'), start = lines.indexOf('    paths:');
  assert(start >= 0, `Missing ${event} path list`);
  const paths = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) continue;
    const match = line.match(/^      - '([^']+)'$/);
    assert(match, `Unsupported ${event} path syntax: ${line}`);
    paths.push(match[1]);
  }
  assert(paths.length > 0);
  return paths;
};
// The checked-in patterns use only literals, * and **. Do not silently interpret
// new glob features with different GitHub semantics.
const matcher = pattern => {
  assert(!/[!+?\[\]{}]/.test(pattern), `Unsupported glob feature: ${pattern}`);
  let expression = '^';
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '*') {
      if (pattern[i + 1] === '*') {expression += '.*'; i++;}
      else expression += '[^/]*';
    } else expression += pattern[i].replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  }
  return new RegExp(expression + '$');
};
const relevant = [
  'server.mjs', 'server/concierge/journey-programs.mjs', 'server/v1404/telegram-language.mjs',
  'scripts/v139/apply.mjs', 'scripts/v139/apply-core.mjs', 'scripts/v14395/apply.mjs',
  'scripts/ci/staged-build-adapter.mjs', 'scripts/ci/staged-concierge-job.mjs',
  'scripts/ci/capture-composition-evidence.mjs', 'scripts/regression-staged-concierge-triggers.mjs',
  'client/src/lib/canonicalRoster.ts', 'client/src/lib/rosterContinuity.ts', 'client/src/pages/Home.tsx',
  'client/index.html', 'shared/notificationChannelPreferences.mjs', 'config/synthetic.json', 'database/schema.sql',
  'package.json', 'package-lock.json', '.env.example', 'tsconfig.json', 'tsconfig.node.json', 'vite.config.ts',
  '.github/workflows/concierge-journey-programs.yml',
];
for (const event of ['pull_request', 'push']) {
  const paths = eventPaths(event), matches = file => paths.some(pattern => matcher(pattern).test(file));
  assert(paths.includes('server.mjs'), `${event} must explicitly include root server.mjs`);
  for (const file of relevant) assert(matches(file), `${event} misses isolated change: ${file}`);
  for (const file of ['server.mjs.bak', 'README.md', 'unrelated.txt']) assert(!matches(file), `${event} unexpectedly matches ${file}`);
  assert(!paths.filter(pattern => pattern !== 'server.mjs').some(pattern => matcher(pattern).test('server.mjs')), 'Regression counterexample: server/** alone misses root server.mjs');
}
console.log(JSON.stringify({status: 'PASS', events: ['pull_request', 'push'], isolatedRelevantPaths: relevant.length, rootServerCounterexample: true}));
