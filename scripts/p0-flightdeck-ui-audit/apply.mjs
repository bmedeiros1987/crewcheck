import fs from 'node:fs';
import { installMenuClarityCss, normalizeFlightDeckUi } from './patch.mjs';

const menuClarityCss = fs.readFileSync(new URL('./menu-clarity.css', import.meta.url), 'utf8').trim();

function update(path, transform) {
  const source = fs.readFileSync(path, 'utf8');
  const next = transform(source);
  if (next !== source) fs.writeFileSync(path, next, 'utf8');
}

update('client/src/pages/Home.tsx', normalizeFlightDeckUi);
update('client/src/index.css', (source) => installMenuClarityCss(source, menuClarityCss));

console.log('[crewcheck:prepare] P0 FlightDeck naming and overflow-safe desktop menu applied.');
