import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sourcePath = 'scripts/v14333/apply.mjs';
const brokenLine = "    flightDay.rawText = `${flightDay.rawText || ''} ${block.text}`.trim();";
const fixedLine = "    flightDay.rawText = (String(flightDay.rawText || '') + ' ' + String(block.text || '')).trim();";

if (!fs.existsSync(sourcePath)) throw new Error('[v14333-loader] Arquivo ausente: scripts/v14333/apply.mjs');
const source = fs.readFileSync(sourcePath, 'utf8');
const prepared = source.includes(fixedLine) ? source : source.replace(brokenLine, fixedLine);
if (!prepared.includes(fixedLine)) throw new Error('[v14333-loader] Ponto de compatibilidade Node 22.13 não localizado.');

const runtimePath = path.join(os.tmpdir(), `crewcheck-v14333-apply-${process.pid}.mjs`);
fs.writeFileSync(runtimePath, prepared, 'utf8');
try {
  await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
} finally {
  try { fs.unlinkSync(runtimePath); } catch {}
}
