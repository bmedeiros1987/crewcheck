import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const base = read('client/src/components/v14313/life-concierge.css');
const layer = read('client/src/components/v14313/ui-lab-concierge-pass7.css');
const panel = read('client/src/components/v14313/LifeConciergePanel.tsx');

function requireText(source, text, label) {
  if (!source.includes(text)) throw new Error(`[UI Lab pass 7] missing ${label}: ${text}`);
}

requireText(base, "@import './ui-lab-concierge-pass7.css';", 'isolated visual layer import');
requireText(layer, 'Presentation-only layer.', 'presentation-only scope marker');
requireText(layer, '.cc-life-ai-shell .cc-life-ai-hero', 'hero hierarchy');
requireText(layer, '.cc-life-ai-shell .cc-life-ai-recommendation', 'recommendation priority');
requireText(layer, '.cc-life-ai-shell .cc-life-ai-dashboard', 'metric hierarchy');
requireText(layer, '.cc-life-ai-shell .cc-life-ai-action-grid', 'quick actions');
requireText(layer, '.cc-life-ai-shell .cc-life-ai-collapsible', 'secondary surfaces');
requireText(layer, ':focus-visible', 'keyboard focus');
requireText(layer, '@media (max-width: 680px)', 'mobile layout');
requireText(layer, '@media (max-width: 420px)', 'small watch-sized viewport guard');
requireText(layer, '@media (prefers-reduced-motion: reduce)', 'reduced motion');

for (const className of [
  'cc-life-ai-hero',
  'cc-life-ai-recommendation',
  'cc-life-ai-dashboard',
  'cc-life-ai-actions',
  'cc-life-gym-checkin',
  'cc-life-ai-collapsible',
]) {
  requireText(panel, className, `panel contract ${className}`);
}

const forbiddenCss = [
  /display\s*:\s*none/i,
  /visibility\s*:\s*hidden/i,
  /opacity\s*:\s*0(?:\D|$)/i,
  /localStorage/i,
  /sessionStorage/i,
  /\bfetch\s*\(/i,
  /navigator\./i,
  /addEventListener/i,
];

for (const pattern of forbiddenCss) {
  if (pattern.test(layer)) throw new Error(`[UI Lab pass 7] visual layer contains forbidden behavior: ${pattern}`);
}

if (!layer.trimStart().startsWith('/* CrewCheck UI Lab — pass 7')) {
  throw new Error('[UI Lab pass 7] layer must remain explicitly attributable and auditable');
}

console.log('UI Lab Concierge pass 7: PASS');
