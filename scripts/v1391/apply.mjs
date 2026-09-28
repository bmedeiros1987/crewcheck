import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, value) { fs.writeFileSync(path, value, 'utf8'); }
function patch(path, transform) {
  const before = read(path);
  const after = transform(before);
  if (after !== before) {
    write(path, after, 'utf8');
    console.log(`v13.9.1 patch: ${path}`);
  }
}
function requireAnchor(source, anchor, label) {
  if (!source.includes(anchor)) throw new Error(`v13.9.1: âncora ausente em ${label}`);
}
function insertAfter(source, anchor, value, marker, label) {
  if (source.includes(marker)) return source;
  requireAnchor(source, anchor, label);
  return source.replace(anchor, `${anchor}\n${value}`);
}

patch('client/src/main.tsx', (source) => insertAfter(source, 'import "./premium-audit-v13-8-8.css";', 'import "./launch-v13-9-1.css";', 'launch-v13-9-1.css', 'main CSS'));

patch('client/src/pages/Home.tsx', (source) => {
  const importAnchor = "import RoutineIntelligenceView from '@/components/v139/RoutineIntelligenceView';";
  source = insertAfter(source, importAnchor, [
    "import EmergencyCenterView from '@/components/v1391/EmergencyCenterView';",
    "import PresentationStayManagerView from '@/components/v1391/PresentationStayManagerView';",
    "import RosterLaunchView from '@/components/v1391/RosterLaunchView';",
  ].join('\n'), '@/components/v1391/EmergencyCenterView', 'Home launch imports');

  source = source.replace("| 'bids' | 'crewlock' | 'admin';", "| 'bids' | 'crewlock' | 'emergency' | 'admin';");
  source = source.replace("const DEFAULT_VERSION = '13.9.0';", "const DEFAULT_VERSION = '13.9.1';");
  source = source.replace("const DEFAULT_VERSION = '13.8.8';", "const DEFAULT_VERSION = '13.9.1';");
  source = source.replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, "const CREWCHECK_UI_CORE_NOTE = 'v13.9.1: estabilização de lançamento, CrewLock, PBS, emergência e escala contínua';");

  if (!source.includes("['emergency','Emergência'")) {
    const menuAnchor = "['crewlock','CrewLock','Documentos privados e criptografados',Lock],";
    requireAnchor(source, menuAnchor, 'menu CrewLock');
    source = source.replace(menuAnchor, `${menuAnchor} ['emergency','Emergência','Contatos, hotel e perfil médico',AlertTriangle],`);
  }
  source = source.replace("'regulation','bids','crewlock','admin'", "'regulation','bids','crewlock','emergency','admin'");

  source = source.replace("{view === 'roster' && <Roster roster={bundle.roster} events={events} setView={setView}/>}", "{view === 'roster' && <RosterLaunchView events={events} setView={setView}/>}");
  source = source.replace("{view === 'presentation' && <PresentationManagerView events={events}/>}", "{view === 'presentation' && <PresentationStayManagerView events={events}/>}");
  if (!source.includes("view === 'emergency' && <EmergencyCenterView")) {
    const routeAnchor = "    {view === 'crewlock' && <CrewLockView/>}";
    requireAnchor(source, routeAnchor, 'rota CrewLock');
    source = source.replace(routeAnchor, `${routeAnchor}\n    {view === 'emergency' && <EmergencyCenterView/>}`);
  }

  if (!source.includes("workMode?: 'operating' | 'extra';")) {
    source = source.replace('  presentationSource?: string;\n};', "  presentationSource?: string;\n  workMode?: 'operating' | 'extra';\n  groundBeforeMinutes?: number;\n};");
  }

  const oldFlight = "      const workType = safe(anyLeg.workType || (leg as any).workType, 'OP').toUpperCase();\n      const title = event.flightNumber + ' · ' + workTypeLabel(workType);";
  if (source.includes(oldFlight)) {
    source = source.replace(oldFlight, "      const workType = safe(anyLeg.workType || (leg as any).workType, 'OP').toUpperCase();\n      const workMode: 'operating' | 'extra' = /(^|\\s)(PS|PAX|DH|EXTRA|PASSAGEIRO)(\\s|$)/.test(workType) ? 'extra' : 'operating';\n      const title = `${event.flightNumber} · ${event.origin} → ${event.destination}`;");
  }
  if (!source.includes('        workMode,\n        groundBeforeMinutes: event.groundBeforeMinutes,')) {
    const returnAnchor = '        airlineName,\n        hotel:';
    requireAnchor(source, returnAnchor, 'retorno de voo');
    source = source.replace(returnAnchor, '        airlineName,\n        workMode,\n        groundBeforeMinutes: event.groundBeforeMinutes,\n        hotel:');
  }

  return source;
});

patch('server.mjs', (source) => {
  source = source.replaceAll('handleV139Telegram(message, sendTelegramMessage)', 'handleV139Telegram(update, sendTelegramMessage)');
  const lines = source.split('\n');
  const seen = new Set();
  source = lines.filter((line) => {
    if (!line.includes('handleV139Telegram(update, sendTelegramMessage)')) return true;
    const normalized = line.trim();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).join('\n');
  return source.replaceAll('13.9.0', '13.9.1');
});

console.log('CrewCheck v13.9.1 launch integration complete.');
