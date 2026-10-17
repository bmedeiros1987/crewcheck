import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as tar from 'tar';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { expand } from 'brace-expansion';

// Bounded synthetic compatibility fixtures; no registry, provider or credentials.
assert.deepEqual(expand('qa/{one,two}/{a,b}'), ['qa/one/a', 'qa/one/b', 'qa/two/a', 'qa/two/b']);
const attrs = Array.from({ length: 1500 }, (_, i) => `a${i}="${i}"`).join(' ');
const doc = new DOMParser().parseFromString(`<qa ${attrs}>synthetic</qa>`, 'text/xml');
assert.equal(doc.documentElement.attributes.length, 1500);
assert.equal(doc.documentElement.getAttribute('a1499'), '1499');
assert(new XMLSerializer().serializeToString(doc).includes('synthetic'));
const dir = await mkdtemp(path.join(os.tmpdir(), 'crewcheck-tar-'));
try {
  await writeFile(path.join(dir, 'selected.txt'), 'synthetic');
  await writeFile(path.join(dir, 'ignored.txt'), 'ignored');
  await tar.c({ cwd: dir, file: path.join(dir, 'qa.tar') }, ['selected.txt', 'ignored.txt']);
  const selected = [];
  await tar.t({ file: path.join(dir, 'qa.tar'), onReadEntry: entry => selected.push(entry.path) }, ['selected.txt']);
  assert.deepEqual(selected, ['selected.txt']);
  console.log('PASS bounded brace expansion, XML attributes/serialization and tar member selection');
} finally {
  await rm(dir, { recursive: true, force: true });
}
