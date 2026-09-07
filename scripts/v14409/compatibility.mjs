import fs from 'node:fs';

const file = 'client/src/pages/Home.tsx';
if (!fs.existsSync(file)) throw new Error('[v14409-compat] Home.tsx ausente.');
let source = fs.readFileSync(file, 'utf8');

const manualDateBlock = "  const eventDate = event.date instanceof Date && !Number.isNaN(event.date.getTime())\n    ? `${event.date.getFullYear()}-${pad2(event.date.getMonth() + 1)}-${pad2(event.date.getDate())}`\n    : '';";
const canonicalDateBlock = '  const eventDate = radarEventOperationalDate(event);';

if (source.includes(manualDateBlock)) source = source.replace(manualDateBlock, canonicalDateBlock);
if (!source.includes(canonicalDateBlock)) throw new Error('[v14409-compat] data operacional canônica não foi ligada ao Radar/Cirium.');
if (!source.includes('new URLSearchParams({ flight, carrier, date: eventDate')) throw new Error('[v14409-compat] data operacional não está sendo enviada ao backend.');

fs.writeFileSync(file, source, 'utf8');
await import('./route-match-hardening.mjs');
console.log('[v14409-compat] Radar/Cirium usa radarEventOperationalDate(event), preservando a identidade da ocorrência inclusive em jornadas que cruzam a meia-noite.');
