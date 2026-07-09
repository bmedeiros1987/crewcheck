import fs from 'node:fs';
const source = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const required = [
  "const DEFAULT_VERSION = '13.4.7';",
  "'presentation' | 'mycar' | 'iflight'",
  "function RosterEventChips",
  "function RosterInlineWeatherBlock",
  "function useWeatherLandingMonitor",
  "<RosterInlineWeatherBlock event={event}/>",
  "<RosterEventChips event={e}/>",
  "timelineStateClass(e)",
  "function MyCarView",
  "function IFlightPushView",
  "{view === 'mycar' && <MyCarView event={event}/>}",
  "{view === 'iflight' && <IFlightPushView actions={actions}/>}",
  "Alertar piora até o pouso",
  "Somente novo METAR ou SPECI",
  "Gerenciador de apresentação",
  "financeSnapshot(normalizedRoster)",
];
for (const token of required) if (!source.includes(token)) throw new Error(`Missing v13.4.7 token: ${token}`);
const forbidden = ['Real/API', '<b>TomTom</b>', 'TomTom / hotel'];
for (const token of forbidden) if (source.includes(token)) throw new Error(`Forbidden technical token still present: ${token}`);
console.log('v13.4.7 lounge systems restore regression OK');
