import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sourcePath = 'scripts/v14340/parser.mjs';
const original = fs.readFileSync(sourcePath, 'utf8');
const oldBlock = `  if (!next.includes('function rescueFlightsFromVisualRows(')) {
    const anchor = 'function rescueFlightsFromFullText(';
    if (!next.includes(anchor)) throw new Error('[v14340] Âncora do resgate visual ausente.');
    next = next.replace(anchor, \`${'${clientVisualRescue}'}\\n\\n${'${anchor}'}\`);
  }`;
const robustBlock = `  if (!next.includes('function rescueFlightsFromVisualRows(')) {
    const anchor = next.includes('function rescueFlightsFromFullText(')
      ? 'function rescueFlightsFromFullText('
      : next.includes('function addDaysToRosterDate(')
        ? 'function addDaysToRosterDate('
        : next.includes('function countRosterEvents(')
          ? 'function countRosterEvents('
          : '';
    if (!anchor) throw new Error('[v14340] Âncora compatível do resgate visual ausente.');
    next = next.replace(anchor, \`${'${clientVisualRescue}'}\\n\\n${'${anchor}'}\`);
  }`;
const prepared = original.includes(robustBlock) ? original : original.replace(oldBlock, robustBlock);
if (!prepared.includes('Âncora compatível do resgate visual')) throw new Error('[v14340-loader] Compatibilidade do resgate visual não aplicada.');
const runtimePath = path.join(os.tmpdir(), `crewcheck-v14340-parser-${process.pid}.mjs`);
fs.writeFileSync(runtimePath, prepared, 'utf8');
try {
  await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
} finally {
  try { fs.unlinkSync(runtimePath); } catch {}
}
