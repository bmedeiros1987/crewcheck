import fs from 'node:fs';

const VERSION = '14.3.2';
const MARKER = 'crewcheck-homologation-v1432';

function update(path, transform) {
  if (!fs.existsSync(path)) throw new Error(`[v1432] Arquivo obrigatório ausente: ${path}`);
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function required(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v1432] Âncora não encontrada: ${label}`);
  return source.replace(before, after);
}

const rosterBadge = fs.readFileSync('scripts/v1432/client-roster-regulation.snippet', 'utf8');
const demoRoster = fs.readFileSync('scripts/v1432/client-demo-roster.snippet', 'utf8');
const serverRegulation = fs.readFileSync('scripts/v1432/server-regulation.snippet', 'utf8');
const securityHeaders = fs.readFileSync('scripts/v1432/security-headers.snippet', 'utf8');
const routeHealth = fs.readFileSync('scripts/v1432/route-health.snippet', 'utf8');

update('client/src/pages/Home.tsx', (source) => {
  let next = source;
  next = required(next,
    "import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';",
    "import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';\nimport { createPortal } from 'react-dom';",
    'portal do rodapé');
  next = required(next,
    "import ManualRegulationView from '@/components/v1392/ManualRegulationView';",
    "import ManualRegulationView, { regulationForScheduleDay } from '@/components/v1432/ManualRegulationView';\nimport FirstAccessTour from '@/components/v1432/FirstAccessTour';",
    'regulamentação v14.3.2');

  if (!next.includes('return createPortal(<nav className="cz-bottom-nav"')) {
    next = required(next,
      'return <nav className="cz-bottom-nav" aria-label="Navegação principal">',
      'return createPortal(<nav className="cz-bottom-nav" aria-label="Navegação principal">',
      'abertura do portal do rodapé');
    next = required(next,
      '  })}</nav>;\n}\nfunction KpiCard',
      '  })}</nav>, document.body);\n}\nfunction KpiCard',
      'fechamento do portal do rodapé');
  }

  if (!next.includes('function RosterRegulationBadge')) {
    next = required(next, 'function Roster({ roster, events, setView }:', `${rosterBadge}function Roster({ roster, events, setView }:`, 'badge regulatório da escala');
  }
  if (!next.includes('function buildCrewCheckDemoRoster')) {
    next = required(next, 'function loadRoster(): BundleState {', `${demoRoster}function loadRoster(): BundleState {`, 'escala fictícia do modo demonstração');
  }
  next = required(next,
    "  const roster = emptyRoster();\n  return { roster, compliance: neutralCompliance(roster), source: 'Nenhuma escala carregada' };",
    "  const demoActive = sessionStorage.getItem('crewcheck_demo_active') === '1';\n  if (demoActive) {\n    const roster = buildCrewCheckDemoRoster();\n    return { roster, compliance: analyzeSafe(roster), source: 'Demonstração fictícia CrewCheck' };\n  }\n  const roster = emptyRoster();\n  return { roster, compliance: neutralCompliance(roster), source: 'Nenhuma escala carregada' };",
    'carregamento automático da demonstração');
  next = required(next,
    '</span></header>{dayEvents.map(e =>',
    '</span><RosterRegulationBadge day={day}/></header>{dayEvents.map(e =>',
    'badge no cabeçalho de cada dia');
  next = required(next,
    "{view === 'regulation' && <ManualRegulationView compliance={compliance}/>}",
    "{view === 'regulation' && <ManualRegulationView compliance={compliance} scheduleDay={event?.day}/>}",
    'programação do dia no cálculo');
  next = required(next,
    '    <BottomNav view={view} setView={setView} openMenu={() => setDrawer(true)}',
    `    <FirstAccessTour currentView={view} onNavigate={(nextView) => setView(normalizeInitialView(nextView))}/>
    <BottomNav view={view} setView={setView} openMenu={() => setDrawer(true)}`,
    'tutorial de primeiro acesso');
  next = next
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: homologação responsiva, tutorial acessível e regulamentação diária no app e Telegram';`);
  if (!next.includes('function RosterRegulationBadge') || !next.includes('createPortal(<nav className="cz-bottom-nav"')) throw new Error('[v1432] Home não recebeu a homologação completa.');
  return next;
});

update('client/src/App.tsx', (source) => source
  .replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`));

update('client/src/pages/AuthPage.tsx', (source) => source
  .replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`)
  .replace(/data-version="[^"]+"/g, `data-version="${VERSION}"`)
  .replace(/CREWCHECK V[^•<]+• PREMIUM BETA/g, `CREWCHECK V${VERSION} • PREMIUM BETA`));

update('client/src/main.tsx', (source) => {
  if (source.includes('v1432/homologation.css')) return source;
  const lines = source.split('\n');
  let lastImport = -1;
  lines.forEach((line, index) => { if (/^import\s/.test(line)) lastImport = index; });
  if (lastImport < 0) throw new Error('[v1432] Nenhum import encontrado em client/src/main.tsx.');
  lines.splice(lastImport + 1, 0, 'import "./components/v1432/homologation.css";');
  return lines.join('\n');
});

update('server.mjs', (source) => {
  let next = source;
  if (!next.includes('function applyCrewCheckSecurityHeaders')) {
    next = required(next, 'function serveStatic(req, res, url) {', `${securityHeaders}\nfunction serveStatic(req, res, url) {`, 'cabeçalhos de segurança');
  }
  if (!next.includes('function handleRouteHealth')) {
    next = required(next, 'async function handleRoutePreview(req, res, url) {', `${routeHealth}\nasync function handleRoutePreview(req, res, url) {`, 'diagnóstico da rota ao vivo');
  }
  next = required(next,
    "async function googleRoutePreview(origin, destination, requestedMode, key) {\n  const travelMode = requestedMode === 'transit' ? 'TRANSIT' : 'DRIVE';\n  const result = await fetchRouteJson",
    "async function googleRoutePreview(origin, destination, requestedMode, key) {\n  const travelMode = requestedMode === 'transit' ? 'TRANSIT' : 'DRIVE';\n  const originCoordinate = routeCoordinate(origin);\n  const destinationCoordinate = routeCoordinate(destination);\n  const result = await fetchRouteJson",
    'coordenadas na rota Google');
  next = required(next,
    "        origin: { address: origin },\n        destination: { address: destination },",
    "        origin: originCoordinate ? { location: { latLng: originCoordinate } } : { address: origin },\n        destination: destinationCoordinate ? { location: { latLng: destinationCoordinate } } : { address: destination },",
    'payload de coordenadas da rota');
  next = required(next,
    "  if (url.pathname === '/api/maps/route-preview') return handleRoutePreview(req, res, url);",
    "  if (url.pathname === '/api/maps/route-health') return handleRouteHealth(req, res, url);\n  if (url.pathname === '/api/maps/route-preview') return handleRoutePreview(req, res, url);",
    'rota de diagnóstico');
  next = required(next,
    'http.createServer(async (req, res) => {\n  const url = new URL',
    'http.createServer(async (req, res) => {\n  applyCrewCheckSecurityHeaders(req, res);\n  const url = new URL',
    'aplicação global dos cabeçalhos');
  if (!next.includes('function conciergeRegulationReply')) {
    next = required(next, 'function conciergeComplianceReply(snapshot) {', `${serverRegulation}\nfunction conciergeComplianceReply(snapshot) {`, 'motor regulatório do Telegram');
  }
  next = required(next,
    "    '/conformidade — leitura preventiva',",
    "    '/regulamentacao — corte e fim da jornada de hoje',\n    '/conformidade — leitura preventiva',",
    'ajuda do Telegram');
  next = required(next,
    "    [{ text: '🌦️ ATIS / METAR' }, { text: '📞 Solicitar ligação' }],",
    "    [{ text: '🌦️ ATIS / METAR' }, { text: '⏱ Regulamentação' }],\n    [{ text: '📞 Solicitar ligação' }],",
    'teclado do Telegram');
  next = required(next,
    "  if (normalized.includes('atis')) return '/metar';",
    "  if (normalized.includes('atis')) return '/metar';\n  if (normalized.includes('regulament')) return '/regulamentacao';",
    'atalho do teclado para regulamentação');
  next = required(next,
    "  if (/^\\/conformidade(?:@\\S+)?\\b/i.test(value) || /\\b(rbac|act|irregularidade|conformidade)\\b/i.test(lower)) return conciergeComplianceReply(snapshot);",
    "  if (/^\\/(?:regulamentacao|regulamentação|regulacao|regulação)(?:@\\S+)?\\b/i.test(value) || /\\b(at[eé] que horas (?:vai|vai minha|termina).{0,24}regulamenta[cç][aã]o|hor[aá]rio do corte|fim da jornada)\\b/i.test(lower)) return conciergeRegulationReply(snapshot);\n  if (/^\\/conformidade(?:@\\S+)?\\b/i.test(value) || /\\b(rbac|act|irregularidade|conformidade)\\b/i.test(lower)) return conciergeComplianceReply(snapshot);",
    'intenção natural de regulamentação');
  next = next.replace(
    "'/diarias','/conformidade']",
    "'/diarias','/regulamentacao','/conformidade']");
  next = required(next,
    "    { command: 'atis', description: 'ATIS meteorológico em voz' },",
    "    { command: 'atis', description: 'ATIS meteorológico em voz' },\n    { command: 'regulamentacao', description: 'Corte e fim da jornada de hoje' },",
    'menu de comandos do bot');
  next = next.replace('atisSupported: true, aviationWeatherCache: true', 'atisSupported: true, regulationSupported: true, aviationWeatherCache: true');
  next = required(next,
    "  if (/despert|wake|alarme|soneca/.test(value)) return 'Despertador Inteligente: configure o canal no app. Telegram fica disponível quando seu chat estiver vinculado; ligação depende do canal de voz configurado.';",
    "  if (/regulament|hor[aá]rio do corte|fim da jornada/.test(value)) return 'Regulamentação: sincronize a escala e use /regulamentacao para receber o corte e o fim da jornada de hoje.';\n  if (/despert|wake|alarme|soneca/.test(value)) return 'Despertador Inteligente: configure o canal no app. Telegram fica disponível quando seu chat estiver vinculado; ligação depende do canal de voz configurado.';",
    'resposta legada de regulamentação');
  if (!next.includes('regulationSupported: true') || !next.includes("command: 'regulamentacao'") || !next.includes("X-Frame-Options', 'DENY") || !next.includes("url.pathname === '/api/maps/route-health'")) throw new Error('[v1432] Servidor não recebeu a homologação completa.');
  next = next
    .replace(/version:'\d+\.\d+\.\d+'/g, `version:'${VERSION}'`)
    .replaceAll('CrewCheck 13.9.0 - Safe Shell', `CrewCheck ${VERSION} - Safe Shell`)
    .replaceAll('v=13.9.0', `v=${VERSION}`)
    .replaceAll('static-shell-13.9.0', `static-shell-${VERSION}`);
  return next;
});

update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - complete responsive homologation, guided onboarding and daily regulation`; 
  data.scripts ||= {};
  data.scripts['regression:v14.3.2'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-2-homologation.mjs';
  return `${JSON.stringify(data, null, 2)}\n`;
});

console.log(`[v1432] CrewCheck ${VERSION}: ${MARKER}, rodapé iPad estável, contraste unificado, tutorial e regulamentação diária.`);
