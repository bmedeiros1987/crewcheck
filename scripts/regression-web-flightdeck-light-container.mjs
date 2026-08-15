import fs from 'node:fs';

const css = fs.readFileSync('client/src/styles/web-flightdeck-light-container.css', 'utf8');
const main = fs.readFileSync('client/src/main.tsx', 'utf8');

const required = [
  "width: min(calc(100vw - 48px), 1120px) !important;",
  "max-width: 1120px !important;",
  "margin-inline: auto !important;",
  "[data-crew-theme='light'] .cc-flydeck-briefing",
  "linear-gradient(145deg, rgba(255, 255, 255, .96), rgba(244, 248, 252, .94)) !important;",
  "color: var(--briefing-ink) !important;",
  "background: rgba(255, 255, 255, .72) !important;",
];

for (const needle of required) {
  if (!css.includes(needle)) throw new Error(`missing FlightDeck light/container contract: ${needle}`);
}

if (!main.includes('import "./styles/web-flightdeck-light-container.css";')) {
  throw new Error('FlightDeck light/container override is not loaded by main.tsx');
}

if (css.includes("[data-crew-theme='light'] .cc-flydeck-briefing {\n    --briefing-ink: #f8fbff")) {
  throw new Error('light theme regressed to dark briefing ink');
}

console.log('ok - FlightDeck Web uses canonical 1120px rail and a true light surface');
