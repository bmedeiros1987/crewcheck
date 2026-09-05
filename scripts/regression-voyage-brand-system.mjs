import fs from 'node:fs';

const html = fs.readFileSync('voyage-preview/index.html', 'utf8');
const checks = [
  ['marca Voyage', /VOYAGE/],
  ['assinatura Beyond the Trip', /Beyond the Trip/i],
  ['marca alada SVG', /class="brand-mark"[\s\S]*?<svg|<svg class="brand-mark"/],
  ['token ouro principal', /--gold:#d9ad69/],
  ['token champagne', /--champagne:#f3e7d2/],
  ['tema dark navy', /html\[data-theme="dark"\][\s\S]*?--bg:#07101c/],
  ['tema light lounge', /html\[data-theme="light"\][\s\S]*?--bg:#f4efe7/],
  ['títulos editoriais serifados', /Georgia,"Times New Roman",serif/],
  ['persistência de tema', /localStorage\.setItem\('voyage-theme'/],
  ['respeita preferência do sistema', /prefers-color-scheme: light/],
  ['navegação premium com VoyMate', />VoyMate</],
  ['assinatura humana da marca', /Technology for a more human journey/i],
];

let failed = 0;
console.log('\nVoyage — premium brand-system contract');
for (const [label, pattern] of checks) {
  const ok = pattern.test(html);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed += 1;
}
console.log(`  ---> ${checks.length - failed} passed, ${failed} failed`);
if (failed) process.exit(1);
