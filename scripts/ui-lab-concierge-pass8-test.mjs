import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const base = read('client/src/components/v14313/life-concierge.css');
const layer = read('client/src/components/v14313/ui-lab-concierge-pass8.css');
const panel = read('client/src/components/v14313/LifeConciergePanel.tsx');

function requireText(source, text, label) {
  if (!source.includes(text)) throw new Error(`[UI Lab pass 8] missing ${label}: ${text}`);
}

const pass7Import = "@import './ui-lab-concierge-pass7.css';";
const pass8Import = "@import './ui-lab-concierge-pass8.css';";
requireText(base, pass7Import, 'pass 7 import');
requireText(base, pass8Import, 'pass 8 import');
if (base.indexOf(pass8Import) < base.indexOf(pass7Import)) {
  throw new Error('[UI Lab pass 8] continuity layer must load after pass 7');
}

requireText(layer, 'Presentation-only layer.', 'presentation-only scope marker');
for (const token of [
  '--cc-watch-cyan: #22d3ee',
  '--cc-watch-blue: #3b82f6',
  '--cc-watch-violet: #8b5cf6',
  '--cc-watch-magenta: #ec4899',
  '--cc-watch-success: #34d399',
  '--cc-watch-warning: #fbbf24',
]) requireText(layer, token, `CrewWatch semantic token ${token}`);

for (const category of ['rest', 'hydration', 'exercise', 'study', 'leisure']) {
  requireText(layer, `.cc-life-ai-recommendation.${category}`, `recommendation state ${category}`);
}

for (const contract of [
  '.cc-life-learning',
  '.cc-life-ai-recommendation .primary',
  '.cc-life-ai-dashboard article:nth-child(5)',
  '.cc-life-session-live',
  '.cc-life-ai-action-grid button.active',
  '@media (max-width: 680px)',
  '@media (max-width: 420px)',
  '@media (prefers-reduced-motion: reduce)',
]) requireText(layer, contract, `visual contract ${contract}`);

for (const className of [
  'cc-life-learning',
  'cc-life-ai-recommendation',
  'cc-life-ai-dashboard',
  'cc-life-session-live',
  'cc-life-ai-action-grid',
]) requireText(panel, className, `panel hook ${className}`);

const forbiddenCss = [
  /display\s*:\s*none/i,
  /visibility\s*:\s*hidden/i,
  /opacity\s*:\s*0\s*[;}]/i,
  /localStorage/i,
  /sessionStorage/i,
  /\bfetch\s*\(/i,
  /navigator\./i,
  /addEventListener/i,
  /position\s*:\s*fixed/i,
];
for (const pattern of forbiddenCss) {
  if (pattern.test(layer)) throw new Error(`[UI Lab pass 8] visual layer contains forbidden behavior: ${pattern}`);
}

if (!layer.trimStart().startsWith('/* CrewCheck UI Lab — pass 8')) {
  throw new Error('[UI Lab pass 8] layer must remain explicitly attributable and auditable');
}

console.log('UI Lab Concierge pass 8: PASS');
