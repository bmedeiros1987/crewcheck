export function normalizeFlightDeckUi(source) {
  return source.replaceAll('FLYDECK', 'FLIGHTDECK').replaceAll('FlyDeck', 'FlightDeck');
}

export function installMenuClarityCss(source, menuClarityCss) {
  const marker = '/* CrewCheck P0 — FlightDeck naming and overflow-safe desktop menu */';
  if (source.includes(marker)) return source;
  return `${source.trimEnd()}\n\n${menuClarityCss.trim()}\n`;
}
