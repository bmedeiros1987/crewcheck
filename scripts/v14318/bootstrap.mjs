import fs from 'node:fs';

const path = new URL('./apply.mjs', import.meta.url);
let source = fs.readFileSync(path, 'utf8');

source = source.replace(
  /  if \(!next\.includes\('await handleTelegramLocationAndPlaces\(update\)'\)\) \{[\s\S]*?\n  \}/,
  `  if (!next.includes('await handleTelegramLocationAndPlaces(update)')) {
    const anchor = "    const message = update?.message || update?.edited_message || updateOrMessage || {};";
    next = insertAfter(next, anchor, '    if (await handleTelegramLocationAndPlaces(update)) return true;', 'Telegram localização');
  }`,
);

source = source.replace(
  `    const anchor = "import ManualRegulationView from '@/components/v1392/ManualRegulationView';";`,
  `    const anchor = "import { CREW_HOTEL_CATALOG, type CrewHotelCatalogEntry } from '@/data/crewHotels';";`,
);

source = source.replace(
  `    else if (next.includes("{view === 'admin' && <Admin/>}")) next = next.replace("{view === 'admin' && <Admin/>}", "{view === 'admin' && <><AdminControlCenter/><Admin/></>}");`,
  `    else if (next.includes("{view === 'admin' && <Admin/>}")) next = next.replace("{view === 'admin' && <Admin/>}", "{view === 'admin' && <><AdminControlCenter/><Admin/></>}");
    else if (next.includes("{view === 'admin' && <AdminControlView/>}")) next = next.replace("{view === 'admin' && <AdminControlView/>}", "{view === 'admin' && <><AdminControlCenter/><AdminControlView/></>}");`,
);

source = source.replace(
  /  if \(next\.includes\("const \[originLabel, setOriginLabel\][\s\S]*?\n  \}/,
  '',
);
source = source.replace('      setLocationVersion((value) => value + 1);\n', '');
source = source.replace(
  /  if \(next\.includes\('const \[locationVersion, setLocationVersion\]'\)\) \{[\s\S]*?\n  \}/,
  `  next = next.replace('<GoogleMapsRoutePreview event={event} mode={mode}', "<GoogleMapsRoutePreview key={event.id + '-' + originLabel} event={event} mode={mode}");`,
);

if (!source.includes('const anchor = "    const message = update?.message || update?.edited_message || updateOrMessage || {};"')) {
  throw new Error('[v14318-bootstrap] Handler Telegram atual não foi preparado.');
}
if (!source.includes("import { CREW_HOTEL_CATALOG, type CrewHotelCatalogEntry } from '@/data/crewHotels';")) {
  throw new Error('[v14318-bootstrap] Import atual do Home não foi preparado.');
}

fs.writeFileSync(path, source, 'utf8');

const themePath = new URL('../v14319/apply.mjs', import.meta.url);
let themeSource = fs.readFileSync(themePath, 'utf8');
themeSource = themeSource.replace(
  "    control.setAttribute('title', `${label(preference)}. Toque para alterar.`);",
  "    control.setAttribute('title', label(preference) + '. Toque para alterar.');",
);
if (themeSource.includes("`${label(preference)}. Toque para alterar.`")) {
  throw new Error('[v14318-bootstrap] Runtime de aparência ainda contém template literal aninhado.');
}
fs.writeFileSync(themePath, themeSource, 'utf8');

await import('./apply.mjs');
await import('./hardening.mjs');
await import('../v14319/apply.mjs');
await import('../v14320/apply.mjs');
await import('../v14321/apply.mjs');
