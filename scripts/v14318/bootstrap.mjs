import fs from 'node:fs';

const path = new URL('./apply.mjs', import.meta.url);
let source = fs.readFileSync(path, 'utf8');

const oldBlock = `  if (!next.includes('await handleTelegramLocationAndPlaces(update)')) {
    const block = "  const update = (messageOrUpdate?.message || messageOrUpdate?.edited_message) ? messageOrUpdate : { message: messageOrUpdate };\\n  if (await handleTelegramLocationAndPlaces(update)) return true;";
    next = insertAfter(next, 'export async function handleV139Telegram(messageOrUpdate, sendTelegram) {', block, 'Telegram localização');
  }`;

const newBlock = `  if (!next.includes('await handleTelegramLocationAndPlaces(update)')) {
    const anchor = "    const message = update?.message || update?.edited_message || updateOrMessage || {};";
    next = insertAfter(next, anchor, '    if (await handleTelegramLocationAndPlaces(update)) return true;', 'Telegram localização');
  }`;

if (source.includes(oldBlock)) source = source.replace(oldBlock, newBlock);
source = source.replace(
  `    const anchor = "import ManualRegulationView from '@/components/v1392/ManualRegulationView';";`,
  `    const anchor = "import { CREW_HOTEL_CATALOG, type CrewHotelCatalogEntry } from '@/data/crewHotels';";`,
);

if (!source.includes("const anchor = \"    const message = update?.message || update?.edited_message || updateOrMessage || {};\"")) {
  throw new Error('[v14318-bootstrap] Não foi possível adaptar o handler Telegram atual.');
}
if (!source.includes("const anchor = \"import { CREW_HOTEL_CATALOG, type CrewHotelCatalogEntry } from '@/data/crewHotels';\"")) {
  throw new Error('[v14318-bootstrap] Não foi possível adaptar os imports do Home.');
}

fs.writeFileSync(path, source, 'utf8');
await import('./apply.mjs');
