import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { decodePngRgba, resizeRgbaBilinear, encodePngRgba } from './lib/png-rgba.mjs';

const root = process.cwd();
const candidates = [
  'client/public/icons/crewcheck-icon-v3.png',
  'client/public/icons/crewcheck-icon-v2.png',
].map((relative) => path.join(root, relative));
const sourcePath = candidates.find((candidate) => fs.existsSync(candidate));
if (!sourcePath) throw new Error('[brand] Logo aprovada do menu não encontrada.');

const sourceBytes = fs.readFileSync(sourcePath);
const source = decodePngRgba(sourceBytes);
if (source.width !== source.height) throw new Error(`[brand] Logo do menu precisa ser quadrada; recebida ${source.width}×${source.height}.`);
if (source.width < 128) throw new Error(`[brand] Logo do menu muito pequena: ${source.width}×${source.height}.`);

const canonical = resizeRgbaBilinear(source, 512, 512);
const canonicalBytes = encodePngRgba(canonical);
const targets = [
  'client/public/icons/crewcheck-brand-512.png',
  'client/public/icons/crewcheck-play-store-512.png',
  'client/public/brand/crewcheck-menu-approved-512.png',
].map((relative) => path.join(root, relative));
for (const target of targets) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, canonicalBytes);
}

const embeddedPng = canonicalBytes.toString('base64');
const exactSourceSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="CrewCheck"><image width="512" height="512" href="data:image/png;base64,${embeddedPng}"/></svg>`;
fs.mkdirSync(path.join(root, 'client/public/brand'), { recursive: true });
fs.writeFileSync(path.join(root, 'client/public/brand/crewcheck-play-store-source.svg'), exactSourceSvg, 'utf8');

const digest = crypto.createHash('sha256').update(canonicalBytes).digest('hex');
const metadata = {
  schemaVersion: 1,
  policy: 'exact-menu-identity',
  source: path.relative(root, sourcePath).replaceAll('\\', '/'),
  sourceDimensions: `${source.width}x${source.height}`,
  canonicalDimensions: '512x512',
  sha256: digest,
  outputs: targets.map((target) => path.relative(root, target).replaceAll('\\', '/')),
  note: 'Todos os ativos são derivados do mesmo PNG aprovado que aparece no menu. Nenhum símbolo alternativo é redesenhado.',
};
fs.writeFileSync(path.join(root, 'client/public/brand/crewcheck-brand-metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

console.log(`[brand] Logo canônica 512×512 gerada da marca do menu (${path.basename(sourcePath)}); SHA-256 ${digest}.`);
