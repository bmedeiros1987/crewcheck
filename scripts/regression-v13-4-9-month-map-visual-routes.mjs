import fs from 'node:fs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const css = fs.existsSync('client/src/index.css') ? fs.readFileSync('client/src/index.css', 'utf8') : '';

const required = [
  "const DEFAULT_VERSION = '13.4.9';",
  "function monthlyRouteData(events: ZeroLeg[])",
  "function MonthlyMapView({ events }",
  "function CarView({ event }",
  "function RouteVisual({ event",
  "openMapRoute(event)",
  "openRoadNetwork(event)",
  "if (value === 'map' || value === 'mapa') return 'map';",
  "if (value === 'car' || value === 'meu-carro' || value === 'carro') return 'car';",
  "{view === 'map' && <MonthlyMapView events={events}/>}",
  "{view === 'car' && <CarView event={event}/>}",
  "Mapa apenas visual para rota",
];
for (const token of required) {
  if (!home.includes(token)) throw new Error(`Missing v13.4.9 token: ${token}`);
}

const cssRequired = ['.cz-route-visual', '.cz-month-map-card', '.cz-destination-strip', '.cz-car-card'];
for (const token of cssRequired) {
  if (!css.includes(token)) throw new Error(`Missing v13.4.9 CSS token: ${token}`);
}

const forbidden = [
  "TomTom como API principal",
  "Real/API",
  "TomTom / hotel / pós-pouso",
];
for (const token of forbidden) {
  if (home.includes(token)) throw new Error(`Forbidden technical route label still present: ${token}`);
}

console.log('v13.4.9 monthly map visual routes regression OK');
