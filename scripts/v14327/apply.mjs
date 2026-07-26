import fs from 'node:fs';

const homePath = 'client/src/pages/Home.tsx';
const cssImport = "import '@/components/v14327/smart-departure-clarity.css';";

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`v14.3.27: ponto não localizado — ${label}`);
  return source.replace(before, after);
}

function departureBounds(source) {
  const start = source.indexOf('function Departure(');
  const end = start >= 0 ? source.indexOf('function MonthlyMapView', start) : -1;
  if (start < 0 || end < 0) throw new Error('v14.3.27: bloco estrutural da Saída Inteligente não localizado');
  return { start, end };
}

function replaceInsideDeparture(source, before, after, label) {
  const { start, end } = departureBounds(source);
  const block = source.slice(start, end);
  if (block.includes(after)) return source;
  if (!block.includes(before)) throw new Error(`v14.3.27: ponto estrutural não localizado — ${label}`);
  const patched = block.replace(before, after);
  return `${source.slice(0, start)}${patched}${source.slice(end)}`;
}

function replaceHeroStructurally(source) {
  const { start, end } = departureBounds(source);
  const block = source.slice(start, end);
  if (block.includes('className="cz-depart-when"') && block.includes('className="cz-depart-detail"')) return source;

  const matches = [...block.matchAll(/<article className="cz-depart-hero">[\s\S]*?<\/article>/g)];
  if (matches.length !== 1) throw new Error(`v14.3.27: hero da Saída Inteligente ambíguo — ocorrências ${matches.length}`);

  const current = matches[0][0];
  for (const marker of ['estimate.leaveLabel', 'originLabel', 'event.origin', 'modeLabel']) {
    if (!current.includes(marker)) throw new Error(`v14.3.27: hero sem marcador seguro — ${marker}`);
  }

  const replacement = [
    '    <article className="cz-depart-hero">',
    '      <header className="cz-depart-hero-head"><span>SAÍDA PREVISTA</span><em className={`cz-depart-status ${liveMinutes ? \'ready\' : \'pending\'}`}>{statusLabel}</em></header>',
    '      <div className="cz-depart-when"><span>Sair em {leaveDayLabel}</span><strong className="cz-depart-time">{estimate.leaveLabel}</strong></div>',
    '      <h2>{originLabel} → {event.origin}</h2>',
    '      <div className="cz-depart-detail"><span>{modeLabel}</span><span>{estimate.travelLabel} de deslocamento</span><span>margem {estimate.marginMinutes} min</span><span>apresentação {estimate.presentationLabel}</span></div>',
    '      {rawLiveMinutes > 300 && <p className="cz-depart-warning">A rota terrestre encontrada não combina com esta programação. Mantive uma estimativa local protegida e não usei o trajeto de {Math.floor(rawLiveMinutes / 60)} horas.</p>}',
    '    </article>',
  ].join('\n');

  const absoluteStart = start + (matches[0].index || 0);
  return `${source.slice(0, absoluteStart)}${replacement}${source.slice(absoluteStart + current.length)}`;
}

function replaceDepartureKpiStructurally(source) {
  const { start, end } = departureBounds(source);
  const block = source.slice(start, end);
  if (block.includes('<span>Sair em {leaveDayLabel}</span><strong>{estimate.leaveLabel}</strong>')) return source;

  const pattern = /<div>\s*<Navigation\/>\s*<span>Sair às<\/span>\s*<strong>\{estimate\.leaveLabel\}<\/strong>\s*<\/div>/g;
  const matches = [...block.matchAll(pattern)];
  if (matches.length !== 1) throw new Error(`v14.3.27: KPI de saída ambíguo — ocorrências ${matches.length}`);

  const current = matches[0][0];
  const replacement = '<div><Navigation/><span>Sair em {leaveDayLabel}</span><strong>{estimate.leaveLabel}</strong></div>';
  const absoluteStart = start + (matches[0].index || 0);
  return `${source.slice(0, absoluteStart)}${replacement}${source.slice(absoluteStart + current.length)}`;
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

home = replaceInsideDeparture(
  home,
  "  const estimate = smartDepartureEstimate(event, route, margin);\n  const liveMinutes = routeDurationMinutes(route);",
  "  const estimate = smartDepartureEstimate(event, route, margin);\n  const rawLiveMinutes = routeDurationMinutes(route);\n  const liveMinutes = rawLiveMinutes >= 5 && rawLiveMinutes <= 300 ? rawLiveMinutes : 0;\n  const leaveDayLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(estimate.leaveDate);",
  'variáveis de data e rota dentro de Departure',
);

home = replaceHeroStructurally(home);
home = replaceDepartureKpiStructurally(home);

home = home.replace('data-departure-v1406="true"', 'data-departure-v1406="true" data-departure-v14327="true"');
fs.writeFileSync(homePath, home, 'utf8');
console.log('CrewCheck v14.3.27: Saída Inteligente com data explícita, layout protegido, patch estrutural idempotente e bloqueio de rotas incompatíveis.');