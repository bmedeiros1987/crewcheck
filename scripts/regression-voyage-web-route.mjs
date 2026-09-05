import fs from 'node:fs';

const hostHtml = fs.readFileSync('client/index.html', 'utf8');
const voyageHtml = fs.readFileSync('client/public/voyage/index.html', 'utf8');

const checks = [
  ['host reconhece /voyage', /path === '\/voyage'/],
  ['host reconhece /voyage/', /path === '\/voyage\/'/],
  ['redirect usa shell estático dedicado', /window\.location\.replace\('\/voyage\/index\.html'/],
  ['redirect preserva query', /window\.location\.search/],
  ['redirect preserva hash', /window\.location\.hash/],
  ['shell Voyage existe e carrega marca', /VOYAGE/],
  ['assinatura Beyond the Trip', /Beyond the Trip/i],
  ['token ouro oficial', /--gold:#d9ad69/],
  ['dark navy oficial', /html\[data-theme="dark"\][\s\S]*?--bg:#07101c/],
  ['light lounge oficial', /html\[data-theme="light"\][\s\S]*?--bg:#f4efe7/],
  ['tema persistente Voyage', /voyage-theme/],
  ['CrewCheck continua com root próprio', /<div id="root"><\/div>/],
];

let failed = 0;
console.log('\nVoyage — production /voyage route contract');
for (const [label, pattern] of checks) {
  const source = label.startsWith('host ') || label.startsWith('redirect ') || label.includes('CrewCheck') ? hostHtml : voyageHtml;
  const ok = pattern.test(source);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed += 1;
}
console.log(`  ---> ${checks.length - failed} passed, ${failed} failed`);
if (failed) process.exit(1);
