const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

function artifactEvidence(root = process.cwd()) {
  const testedCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const testedTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' }).trim();
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
  const bundles = {};
  const walk = dir => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else bundles[file] = hash(file);
    }
  };
  walk('dist');
  const embeddedCommitMatches = Object.keys(bundles).filter(file => file.endsWith('.js'))
    .some(file => fs.readFileSync(path.join(root, file), 'utf8').includes(testedCommit));
  if (process.env.UI_EVIDENCE_REQUIRE_COMMIT === '1') {
    assert(embeddedCommitMatches, 'Build must embed this HEAD: SOURCE_VERSION=<HEAD> npm run build');
  }
  const preparedSources = Object.fromEntries([
    'client/src/pages/Home.tsx', 'client/src/main.tsx',
    'client/src/components/navigation/InternalHeaderFrame.tsx',
    'client/src/components/pulse/CrewCheckPulse.tsx',
    'client/src/styles/fixed-navigation-headers.css',
    'client/src/styles/ipad-header-recovery.css', 'server.mjs',
  ].map(file => [file, hash(file)]));
  return { testedCommit, testedTree, embeddedCommitMatches, bundles, preparedSources };
}

module.exports = { artifactEvidence };
