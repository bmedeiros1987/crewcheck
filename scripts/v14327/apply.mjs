import fs from 'node:fs';

const homePath = 'client/src/pages/Home.tsx';
const cssImport = "import '@/components/v14327/smart-departure-clarity.css';";

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`v14.3.27: ponto não localizado — ${label}`);
  return source.replace(before, after);
}

let home = fs.readFileSync(homePath, 'utf8');
if (!home.includes(cssImport)) {
  home = replaceOnce(
    home,
    "import '@/components/v1406/premium-layout.css';",
    "import '@/components/v1406/premium-layout.css';\n" + cssImport,
    'importação do layout',
  );
}

home = replaceOnce(
  home,
  "  const liveMinutes = routeDurationMinutes(route);\n  if (liveMinutes > 0) saveDepartureTravelMinutes(event, liveMinutes);\n  const cachedMinutes = readDepartureTravelMinutes(event);\n  const travelMinutes = liveMinutes || cachedMinutes || defaultDepartureTravelMinutes();\n  const source: SmartDepartureEstimate['source'] = liveMinutes ? 'live' : cachedMinutes ? 'cached' : 'estimated';",
  "  const rawLiveMinutes = routeDurationMinutes(route);\n  const liveMinutes = rawLiveMinutes >= 5 && rawLiveMinutes <= 300 ? rawLiveMinutes : 0;\n  if (liveMinutes > 0) saveDepartureTravelMinutes(event, liveMinutes);\n  const cachedMinutes = readDepartureTravelMinutes(event);\n  const travelMinutes = liveMinutes || cachedMinutes || defaultDepartureTravelMinutes();\n  const source: SmartDepartureEstimate['source'] = liveMinutes ? 'live' : cachedMinutes ? 'cached' : 'estimated';",
  'proteção contra rota terrestre intermunicipal',
);

home = replaceOnce(
  home,
  "  const estimate = smartDepartureEstimate(event, route, margin);\n  const liveMinutes = routeDurationMinutes(route);",
  "  const estimate = smartDepartureEstimate(event, route, margin);\n  const rawLiveMinutes = routeDurationMinutes(route);\n  const liveMinutes = rawLiveMinutes >= 5 && rawLiveMinutes <= 300 ? rawLiveMinutes : 0;\n  const leaveDayLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(estimate.leaveDate);",
  'data da saída na tela completa',
);

home = replaceOnce(
  home,
  "      <strong className=\"cz-depart-time\">{estimate.leaveLabel}</strong>\n      <h2>{originLabel} → {event.origin}</h2>\n      <p>{modeLabel} · {estimate.travelLabel} de deslocamento · margem {estimate.marginMinutes} min · apresentação {estimate.presentationLabel}</p>",
  "      <div className=\"cz-depart-when\"><span>Sair em {leaveDayLabel}</span><strong className=\"cz-depart-time\">{estimate.leaveLabel}</strong></div>\n      <h2>{originLabel} → {event.origin}</h2>\n      <div className=\"cz-depart-detail\"><span>{modeLabel}</span><span>{estimate.travelLabel} de deslocamento</span><span>margem {estimate.marginMinutes} min</span><span>apresentação {estimate.presentationLabel}</span></div>\n      {rawLiveMinutes > 300 && <p className=\"cz-depart-warning\">A rota terrestre encontrada não combina com esta programação. Mantive uma estimativa local protegida e não usei o trajeto de {Math.floor(rawLiveMinutes / 60)} horas.</p>}",
  'hero sem sobreposição',
);

home = replaceOnce(
  home,
  "<div><Navigation/><span>Sair às</span><strong>{estimate.leaveLabel}</strong></div>",
  "<div><Navigation/><span>Sair em {leaveDayLabel}</span><strong>{estimate.leaveLabel}</strong></div>",
  'data no KPI de saída',
);

home = home.replace('data-departure-v1406="true"', 'data-departure-v1406="true" data-departure-v14327="true"');
fs.writeFileSync(homePath, home, 'utf8');
console.log('CrewCheck v14.3.27: Saída Inteligente com data explícita, layout protegido e bloqueio de rotas incompatíveis.');
