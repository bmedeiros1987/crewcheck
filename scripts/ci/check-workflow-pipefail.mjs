import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function indentOf(line) {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

function hasWorkflowPipefailDefault(lines) {
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^defaults:\s*$/.test(lines[i])) continue;
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (line.trim() && indentOf(line) === 0) break;
      if (!/^\s{2}run:\s*$/.test(line)) continue;
      for (let k = j + 1; k < lines.length; k += 1) {
        const runLine = lines[k];
        if (runLine.trim() && indentOf(runLine) <= 2) break;
        if (/^\s{4}shell:\s*.*\bpipefail\b/.test(runLine)) return true;
      }
    }
  }
  return false;
}

export function findUnsafeTeeRuns(text, file = '<fixture>') {
  const lines = String(text).split(/\r?\n/);
  const defaultSafe = hasWorkflowPipefailDefault(lines);
  const violations = [];

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^(\s*)(?:-\s*)?run:\s*(.*)$/);
    if (!match) continue;

    const runIndent = match[1].length;
    const tail = match[2] ?? '';
    let runText = tail;
    let end = i;

    if (/^[|>][-+]?\s*$/.test(tail)) {
      const block = [];
      for (let j = i + 1; j < lines.length; j += 1) {
        const candidate = lines[j];
        if (candidate.trim() && indentOf(candidate) <= runIndent) break;
        block.push(candidate);
        end = j;
      }
      runText = block.join('\n');
    }

    if (!runText.includes('| tee')) {
      i = end;
      continue;
    }

    const explicitSafe = /(?:^|[;\n])\s*set\s+-[^;\n]*\bpipefail\b/.test(runText)
      || /PIPESTATUS\s*\[/.test(runText)
      || /bash\s+-o\s+pipefail\b/.test(runText);

    if (!defaultSafe && !explicitSafe) {
      violations.push(`${file}:${i + 1}: pipeline uses | tee without pipefail/PIPESTATUS propagation`);
    }
    i = end;
  }

  return violations;
}

function runSelfTests() {
  assert.equal(findUnsafeTeeRuns(`jobs:\n  x:\n    steps:\n      - run: node test.mjs | tee out.log\n`).length, 1);
  assert.equal(findUnsafeTeeRuns(`defaults:\n  run:\n    shell: bash -o pipefail {0}\njobs:\n  x:\n    steps:\n      - run: node test.mjs | tee out.log\n`).length, 0);
  assert.equal(findUnsafeTeeRuns(`jobs:\n  x:\n    steps:\n      - run: |\n          set -o pipefail\n          node test.mjs | tee out.log\n`).length, 0);
  assert.equal(findUnsafeTeeRuns(`jobs:\n  x:\n    steps:\n      - run: |\n          set -euo pipefail\n          node test.mjs | tee out.log\n`).length, 0);
  assert.equal(findUnsafeTeeRuns(`jobs:\n  x:\n    steps:\n      - run: |\n          node test.mjs | tee out.log\n          status=\${PIPESTATUS[0]}\n          exit "$status"\n`).length, 0);
  assert.equal(findUnsafeTeeRuns(`jobs:\n  x:\n    steps:\n      - run: node test.mjs\n`).length, 0);
}

async function main() {
  runSelfTests();

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const workflowDir = path.join(repoRoot, '.github', 'workflows');
  const files = (await readdir(workflowDir))
    .filter((name) => /\.ya?ml$/i.test(name))
    .sort();

  const violations = [];
  let teeRunCount = 0;
  for (const name of files) {
    const fullPath = path.join(workflowDir, name);
    const text = await readFile(fullPath, 'utf8');
    teeRunCount += (text.match(/\| tee/g) ?? []).length;
    violations.push(...findUnsafeTeeRuns(text, `.github/workflows/${name}`));
  }

  if (violations.length) {
    console.error('[ci-pipefail] unsafe workflow pipelines found:');
    for (const violation of violations) {
      console.error(`- ${violation}`);
      console.error(`::error title=CI pipeline safety::${violation}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`[ci-pipefail] PASS: ${teeRunCount} tee pipeline(s) audited across ${files.length} workflow(s); exit status propagation is explicit.`);
}

main().catch((error) => {
  console.error('[ci-pipefail] audit crashed', error);
  console.error(`::error title=CI pipeline safety audit crashed::${String(error?.stack || error)}`);
  process.exitCode = 1;
});
