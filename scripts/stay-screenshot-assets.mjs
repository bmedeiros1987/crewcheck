/** Build-time only. Downloads pinned PUBLIC language models, never user input.
 * npm ci must install exact tesseract.js/core 7.0.0. Runtime is self-hosted.
 */
import { readFile, mkdir, writeFile, rename, copyFile, readdir, unlink, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'docs/stay-screenshot');
const output = path.join(root, 'client/public/ocr/v7');
const manifest = JSON.parse(await readFile(path.join(docs, 'ocr-assets-manifest.json'), 'utf8'));
const localFlag = process.argv.indexOf('--model-dir');
const localModels = localFlag >= 0 ? path.resolve(process.argv[localFlag + 1] || '') : null;
if (localFlag >= 0 && !process.argv[localFlag + 1]) throw new Error('--model-dir requires a directory');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const valid = (bytes, asset) => bytes.length === asset.bytes && sha256(bytes) === asset.sha256;
for (const pkg of ['tesseract.js', 'tesseract.js-core']) {
  const metadata = JSON.parse(await readFile(path.join(root, 'node_modules', pkg, 'package.json'), 'utf8'));
  if (metadata.version !== '7.0.0') throw new Error(`Unpinned OCR package: ${pkg}`);
}
await mkdir(output, { recursive: true });
const inventory = [];
for (const asset of manifest.assets) {
  const destination = path.join(output, asset.name);
  let bytes;
  if (asset.name.endsWith('.traineddata.gz')) {
    try { const existing = await readFile(destination); if (valid(existing, asset)) bytes = existing; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!bytes && localModels) bytes = await readFile(path.join(localModels, asset.name));
    if (!bytes) {
      const url = `https://raw.githubusercontent.com/naptha/tessdata/${manifest.modelsRevision}/${manifest.modelsDirectory}/${asset.name}`;
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`Pinned OCR model download failed (${response.status})`);
      if (Number(response.headers.get('content-length')) > 3_000_000) throw new Error('Unexpected OCR model size');
      bytes = Buffer.from(await response.arrayBuffer());
    }
  } else {
    const source = asset.name === 'worker.min.js' ? 'tesseract.js/dist' : 'tesseract.js-core';
    bytes = await readFile(path.join(root, 'node_modules', source, asset.name));
  }
  if (!valid(bytes, asset)) throw new Error(`OCR integrity mismatch: ${asset.name}`);
  const temp = destination + `.tmp-${process.pid}`;
  await writeFile(temp, bytes); await rename(temp, destination);
  inventory.push({ name: asset.name, bytes: bytes.length, sha256: sha256(bytes) });
}
const boundaryBytes = await readFile(path.join(root, 'scripts/stay-screenshot-worker.js'));
if (!valid(boundaryBytes, manifest.boundary) || manifest.boundary.name !== `worker-${sha256(boundaryBytes).slice(0, 16)}.js`) throw new Error('OCR boundary hash/name mismatch');
const clientSource = await readFile(path.join(root, 'client/src/lib/stayScreenshotOcr.ts'), 'utf8');
if (!clientSource.includes(`new URL('${manifest.boundary.name}', base)`)) throw new Error('OCR client boundary path does not match manifest');
await writeFile(path.join(output, manifest.boundary.name), boundaryBytes);
for (const name of await readdir(output)) if (/^worker(?:-[a-f0-9]+)?\.js$/.test(name) && name !== manifest.boundary.name) await unlink(path.join(output, name));
const licenseNames = (await readdir(docs)).filter(name => /^(LICENSE|NOTICE)-/.test(name)).sort();
for (const name of [manifest.boundary.name, ...licenseNames]) {
  if (name !== manifest.boundary.name) await copyFile(path.join(docs, name), path.join(output, name));
  const bytes = await readFile(path.join(output, name));
  inventory.push({ name, bytes: bytes.length, sha256: sha256(bytes) });
}
// This directory is generated and exclusively owned by this builder. Unknown
// files fail closed; only known obsolete wrappers above are removed automatically.
const allowed = new Set([...inventory.map(item => item.name), 'asset-inventory.json']);
for (const name of await readdir(output)) if (!allowed.has(name)) throw new Error(`Unexpected OCR output file: ${name}`);
const totalAssetBytes = inventory.reduce((sum, item) => sum + item.bytes, 0);
let inventoryBytes = 0, serialized;
for (;;) {
  serialized = JSON.stringify({ version: manifest.version, totalAssetBytes, inventoryBytes, totalBytes: totalAssetBytes + inventoryBytes, assets: inventory }, null, 2) + '\n';
  const bytes = Buffer.byteLength(serialized);
  if (bytes === inventoryBytes) break;
  inventoryBytes = bytes;
}
const totalBytes = totalAssetBytes + inventoryBytes;
if (totalBytes > 15_500_000) throw new Error('OCR asset deployment budget exceeded (15.5 MB)');
await writeFile(path.join(output, 'asset-inventory.json'), serialized);
let actualBytes = 0;
for (const name of await readdir(output)) {
  const info = await lstat(path.join(output, name));
  if (!info.isFile()) throw new Error(`OCR output is not a regular file: ${name}`);
  actualBytes += info.size;
}
if (actualBytes !== totalBytes || actualBytes > 15_500_000) throw new Error('Actual OCR output size disagrees with inventory/budget');
console.log(`OCR same-origin assets verified: ${totalBytes} file bytes including inventory; models are lazy, not precached.`);
