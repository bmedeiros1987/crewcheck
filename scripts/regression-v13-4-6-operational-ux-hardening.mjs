import fs from 'node:fs';

const source = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');

const required = [
  "const [showIntro, setShowIntro] = useState(false);",
  "const event = nextFlight(events);",
  "const flightEvent = nextRealFlight(events);",
  "RadarView event={flightEvent}",
  "WeatherView event={flightEvent}",
  "if (value === 'presentation' || value === 'apresentacao') return 'presentation';",
  "toast.message(decision.toastText || 'Importação cancelada.');",
  "sessionStorage.setItem('crewcheck_force_view_once', 'roster');",
  "const visibleUpcoming = upcoming.length ? upcoming : operationalEvents.slice(0, 18);",
  "events.some((event) => !event.placeholder)",
  "programação operacional futura após agora",
  "<em>ROTA</em>",
  "<b>Trânsito</b>",
];

for (const token of required) {
  if (!source.includes(token)) throw new Error(`Missing v13.4.6 token: ${token}`);
}

const forbidden = [
  "storage.get('crewcheck_intro_seen_v1278', '0') !== '1'",
  "não há evento operacional futuro no índice canônico",
  "<em>TOMTOM</em>",
  "<b>API/Trânsito</b>",
  "toast.error(decision.toastText || 'Importação cancelada.');",
];

for (const token of forbidden) {
  if (source.includes(token)) throw new Error(`Forbidden v13.4.6 token still present: ${token}`);
}

console.log('v13.4.6 operational UX hardening regression OK');
