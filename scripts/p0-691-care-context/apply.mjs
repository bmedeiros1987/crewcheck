import fs from 'node:fs';

const TAG = '[p0-691-care-context]';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`${TAG} arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

function write(path, source) {
  fs.writeFileSync(path, source, 'utf8');
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`${TAG} âncora ausente: ${label}`);
  return source.replace(before, after);
}

function insertBeforeRequired(source, anchor, insertion, marker, label) {
  if (source.includes(marker)) return source;
  if (!source.includes(anchor)) throw new Error(`${TAG} âncora ausente: ${label}`);
  return source.replace(anchor, `${insertion}\n\n${anchor}`);
}

function replaceBetweenRequired(source, startMarker, endMarker, replacement, marker, label) {
  if (source.includes(marker)) return source;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) throw new Error(`${TAG} bloco ausente: ${label}`);
  return `${source.slice(0, start)}${replacement}\n\n${source.slice(end)}`;
}

// Some anchors legitimately repeat verbatim at more than one call site (e.g.
// the same day-off code list guards both a day summary and an event line
// renderer). A plain single-shot replace would silently patch only the first
// occurrence and leave the others stale/inconsistent. Replace every literal
// occurrence, and treat "before" fully absent (already replaced everywhere)
// as the idempotent success case rather than presence of "after" alone,
// since "after" can appear from a single prior partial application.
function replaceAllRequired(source, before, after, label) {
  if (!source.includes(before)) {
    if (source.includes(after)) return source;
    throw new Error(`${TAG} âncora ausente: ${label}`);
  }
  return source.split(before).join(after);
}

// Named-import specifiers on a given module drift as other CrewCheck patches
// land on main (more names get added to the same line). Anchoring on the
// exact literal import statement makes this materializer brittle to that
// drift. Insert the needed name into whatever the import list currently is,
// instead of assuming today's exact text.
function ensureNamedImport(source, modulePath, name, label) {
  const pattern = new RegExp(`import \\{([^}]*)\\} from '${modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}';`);
  const match = source.match(pattern);
  if (!match) throw new Error(`${TAG} âncora ausente: ${label}`);
  const names = match[1].split(',').map((n) => n.trim()).filter(Boolean);
  if (names.includes(name)) return source;
  names.unshift(name);
  return source.replace(pattern, `import { ${names.join(', ')} } from '${modulePath}';`);
}

// ---------------------------------------------------------------------------
// Shared client classification / Care Mode contract.
// ---------------------------------------------------------------------------
const classificationPath = 'client/src/lib/scheduleActivityClassification.ts';
let classification = read(classificationPath);

const careTypes = `export type ScheduleCareState = 'LUTO' | 'FERIAS' | 'FOLGA' | 'REPOUSO' | 'NONE';

export type ScheduleCarePresentation = {
  state: Exclude<ScheduleCareState, 'NONE'>;
  label: string;
  message: string;
  suppressRoutineProactivity: boolean;
  suppressHumor: boolean;
  allowCriticalAlerts: boolean;
};`;
classification = insertBeforeRequired(
  classification,
  'const DAY_OFF_CODES = new Set([',
  careTypes,
  'export type ScheduleCareState',
  'tipos de Care Mode',
);

const careCodeSets = `const GRIEF_CODES = new Set(['DMO']);
const VACATION_CODES = new Set(['VC', 'FERIAS']);`;
classification = insertBeforeRequired(
  classification,
  'const OVERNIGHT_CODES = new Set([',
  careCodeSets,
  'const GRIEF_CODES',
  'códigos de luto/férias',
);

const careFunctions = `function resolveCareState(tokens: ReadonlySet<string>): ScheduleCareState {
  if (matchesCodes(tokens, GRIEF_CODES)) return 'LUTO';
  if (matchesCodes(tokens, VACATION_CODES)) return 'FERIAS';
  if (matchesCodes(tokens, RECOVERY_REST_CODES)) return 'REPOUSO';
  if (matchesCodes(tokens, DAY_OFF_CODES)) return 'FOLGA';
  return 'NONE';
}

function publishedPairingTokens(activity: ScheduleActivityLike): Set<string> {
  const published = activity.canonical?.publishedDay;
  return tokensOfValues([
    activity.pairingCode,
    activity.day?.pairingCode,
    published?.pairingCode,
  ].map(normalize).filter(Boolean));
}

/**
 * Semântica humana separada da classificação operacional.
 *
 * O parser legado normaliza alguns códigos publicados de descanso para um tipo
 * amplo (por exemplo, VC pode chegar como type=DO + pairingCode=VC). Por isso o
 * código formal continua soberano para decidir que o dia é não-operacional, mas
 * o pairingCode publicado pode especializar DO em Férias/Luto. Título/rawText
 * nunca ganham esse poder e não podem inventar um estado sensível.
 */
export function careStateForScheduleActivity(activity: ScheduleActivityLike): ScheduleCareState {
  if (!activity || activity.placeholder) return 'NONE';
  const formalTokens = tokensOfValues(formalCodeValues(activity));
  const formalState = resolveCareState(formalTokens);
  const pairingTokens = publishedPairingTokens(activity);
  const pairingSensitiveState = matchesCodes(pairingTokens, GRIEF_CODES)
    ? 'LUTO'
    : (matchesCodes(pairingTokens, VACATION_CODES) ? 'FERIAS' : 'NONE');

  // DO is a known coarse wrapper emitted by the PDF parser for VC/OFF/DOP.
  // Only a published pairing code may specialize that wrapper; arbitrary labels
  // and raw text remain incapable of creating grief/vacation semantics.
  if (formalState === 'FOLGA' && pairingSensitiveState !== 'NONE') {
    const coarseDayOff = [...formalTokens].some((token) => ['DO', 'FOLGA'].includes(token));
    if (coarseDayOff) return pairingSensitiveState;
  }
  if (formalState !== 'NONE') return formalState;

  // Label/pairing/title fallbacks may only decide when the formal code
  // concludes NOTHING at all (formalTokens empty) -- this mirrors the
  // documented #303 source hierarchy just above (fallbackCodeValues exists
  // for the "no published code at all" case, e.g. base rest inferred from
  // continuity). A known-but-unrelated duty/reserve code (e.g. ASB) is a
  // conclusive formal signal and must never be overwritten by a stray
  // pairingCode/title/flightNumber: only the coarse DO/FOLGA wrapper above is
  // allowed to be specialized by a published pairing code.
  if (formalTokens.size > 0) return 'NONE';
  if (pairingSensitiveState !== 'NONE') return pairingSensitiveState;
  return resolveCareState(tokensOfValues(fallbackCodeValues(activity)));
}

export function carePresentationForScheduleActivity(
  activity: ScheduleActivityLike,
): ScheduleCarePresentation | null {
  const state = careStateForScheduleActivity(activity);
  if (state === 'NONE') return null;
  if (state === 'LUTO') {
    return {
      state,
      label: 'Luto',
      message: 'Sua escala marca luto hoje. Sinto muito. Vou ficar mais discreto e só chamar sua atenção para algo realmente importante.',
      suppressRoutineProactivity: true,
      suppressHumor: true,
      allowCriticalAlerts: true,
    };
  }
  if (state === 'FERIAS') {
    return {
      state,
      label: 'Férias',
      message: 'Você está de férias hoje. O CrewCheck fica quieto e mostra só o que você pedir.',
      suppressRoutineProactivity: true,
      suppressHumor: false,
      allowCriticalAlerts: true,
    };
  }
  if (state === 'FOLGA') {
    return {
      state,
      label: 'Folga',
      message: 'Hoje é folga. Sem programação operacional.',
      suppressRoutineProactivity: true,
      suppressHumor: false,
      allowCriticalAlerts: true,
    };
  }
  return {
    state: 'REPOUSO',
    label: 'Repouso',
    message: 'Hoje é repouso. Vou respeitar esse período e evitar briefing operacional de rotina.',
    suppressRoutineProactivity: true,
    suppressHumor: false,
    allowCriticalAlerts: true,
  };
}`;
classification = insertBeforeRequired(
  classification,
  'function activityText(activity: ScheduleActivityLike): string {',
  careFunctions,
  'export function careStateForScheduleActivity',
  'funções de Care Mode',
);

const classifyAnchor = `  if (!activity || activity.placeholder) return 'DESCONHECIDA';\n\n  // Código formal publicado decide primeiro`;
const classifyReplacement = `  if (!activity || activity.placeholder) return 'DESCONHECIDA';\n\n  const careState = careStateForScheduleActivity(activity);\n  if (careState === 'LUTO' || careState === 'FERIAS' || careState === 'FOLGA') return 'FOLGA';\n  if (careState === 'REPOUSO') return 'REPOUSO';\n\n  // Código formal publicado decide primeiro`;
classification = replaceRequired(
  classification,
  classifyAnchor,
  classifyReplacement,
  'precedência de Care Mode na classificação',
);
write(classificationPath, classification);

// ---------------------------------------------------------------------------
// Home / FlightDeck consumer copy + selector guard.
// ---------------------------------------------------------------------------
const homePath = 'client/src/pages/Home.tsx';
let home = read(homePath);
home = ensureNamedImport(
  home,
  '@/lib/scheduleActivityClassification',
  'careStateForScheduleActivity',
  'import de careStateForScheduleActivity',
);
home = replaceRequired(home, "    DR: 'Descanso regulamentar',", "    DR: 'Folga pedida',", 'rótulo DR');
if (!home.includes("    VC: 'Férias',") || !home.includes("    DMO: 'Luto',")) {
  home = replaceRequired(
    home,
    "    OFF: 'Folga',\n    FERIAS: 'Férias',",
    "    OFF: 'Folga',\n    VC: 'Férias',\n    DMO: 'Luto',\n    FERIAS: 'Férias',",
    'rótulos VC/DMO',
  );
}
// Both the primary canonical-event selector (nextFlight) and its
// chronological fallback (chronologicalNextRosterLeg) share this exact
// filter; a care day must never surface as "next operational event" through
// either path.
home = replaceAllRequired(
  home,
  ".filter((event) => !event.placeholder && isProgramScheduleActivity(event))",
  ".filter((event) => !event.placeholder && isProgramScheduleActivity(event) && careStateForScheduleActivity(event) === 'NONE')",
  'selector FlightDeck ignora care days',
);
// The same day-off code list guards both the day-summary copy and the
// per-event line copy; both must recognize VC/DMO explicitly.
home = replaceAllRequired(
  home,
  "['DR', 'DO', 'DOF', 'DOP', 'OFF', 'FERIAS', 'FÉRIAS'].includes(code)",
  "['DR', 'DO', 'DOF', 'DOP', 'OFF', 'VC', 'DMO', 'FERIAS', 'FÉRIAS'].includes(code)",
  'copy de dia não operacional',
);
write(homePath, home);

// ---------------------------------------------------------------------------
// Concierge runtime: DMO/férias/folgas are care days, not roster-empty/programs.
// ---------------------------------------------------------------------------
const serverPath = 'server.mjs';
let server = read(serverPath);
if (!/const conciergeInactiveCodes = new Set\(\[[^\]]*'DMO'[^\]]*\]\);/.test(server)) {
  server = server.replace(
    /const conciergeInactiveCodes = new Set\(\[([^\]]*)\]\);/,
    (_match, inner) => `const conciergeInactiveCodes = new Set([${String(inner).trim().replace(/\s*$/, '')}, 'DMO']);`,
  );
  if (!/const conciergeInactiveCodes = new Set\(\[[^\]]*'DMO'[^\]]*\]\);/.test(server)) {
    throw new Error(`${TAG} não consegui incluir DMO em conciergeInactiveCodes`);
  }
}

const serverCareFunctions = `function conciergeCareCode(day = null) {
  const normalize = (value = '') => String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim().toUpperCase();
  const type = normalize(day?.type);
  const pairing = normalize(day?.pairingCode);
  // VC/DOP/OFF may be normalized by the parser as type=DO while the exact
  // published code remains in pairingCode. Preserve the exact published code.
  if (type === 'DO' && pairing) return pairing;
  return type && type !== 'OTHER' ? type : (pairing || type);
}
function conciergeCareState(day = null) {
  const code = conciergeCareCode(day);
  if (code === 'DMO') return 'LUTO';
  if (code === 'VC' || code === 'FERIAS') return 'FERIAS';
  if (['DO', 'DOF', 'DOP', 'DOPR', 'DR', 'OFF', 'FOLGA'].includes(code)) return 'FOLGA';
  if (['REST', 'REPOUSO', 'DESCANSO', 'DESCANSO_REGULAMENTAR'].includes(code)) return 'REPOUSO';
  return 'NONE';
}
function conciergeCarePresentation(day = null) {
  const state = conciergeCareState(day);
  if (state === 'LUTO') return { state, label: 'Luto', message: 'Sua escala marca luto hoje. Sinto muito. Vou ficar mais discreto e só chamar sua atenção para algo realmente importante.', suppressRoutineProactivity: true, suppressHumor: true, allowCriticalAlerts: true };
  if (state === 'FERIAS') return { state, label: 'Férias', message: 'Você está de férias hoje. O CrewCheck fica quieto e mostra só o que você pedir.', suppressRoutineProactivity: true, suppressHumor: false, allowCriticalAlerts: true };
  if (state === 'FOLGA') return { state, label: 'Folga', message: 'Hoje é folga. Sem programação operacional.', suppressRoutineProactivity: true, suppressHumor: false, allowCriticalAlerts: true };
  if (state === 'REPOUSO') return { state, label: 'Repouso', message: 'Hoje é repouso. Vou respeitar esse período e evitar briefing operacional de rotina.', suppressRoutineProactivity: true, suppressHumor: false, allowCriticalAlerts: true };
  return null;
}`;
if (!server.includes('function conciergeCareState(day = null)')) {
  const remoteStart = server.indexOf('const conciergeRemoteCodes = new Set(');
  const remoteClose = server.indexOf(']);', remoteStart);
  const remoteEnd = server.indexOf('\n', remoteClose);
  if (remoteStart < 0 || remoteClose < 0 || remoteEnd < 0) throw new Error(`${TAG} conciergeRemoteCodes não localizado`);
  server = `${server.slice(0, remoteEnd + 1)}${serverCareFunctions}\n${server.slice(remoteEnd + 1)}`;
}
server = replaceRequired(
  server,
  '    if (conciergeInactiveCodes.has(code)) continue;',
  "    if (conciergeCareState(day) !== 'NONE' || conciergeInactiveCodes.has(code)) continue;",
  'filtro de registros do Concierge por Care Mode',
);
write(serverPath, server);

// ---------------------------------------------------------------------------
// Human blank-day renderer: explicit care copy instead of "roster blank".
// ---------------------------------------------------------------------------
const humanPath = 'server/v1403/telegram-human.mjs';
let human = read(humanPath);
const blankDayReplacement = [
  "export function buildBlankDaySummary({ profile = {}, snapshot = {}, day = null, label = 'Hoje' } = {}) {",
  '  const greeting = premiumGreeting(profile, snapshot);',
  "  const normalize = (value = '') => String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').trim().toUpperCase();",
  '  const type = normalize(day?.type);',
  '  const pairing = normalize(day?.pairingCode);',
  "  const code = type === 'DO' && pairing ? pairing : (type && type !== 'OTHER' ? type : (pairing || type));",
  "  const when = String(label || 'Hoje').trim();",
  '  const end = day?.restEnd || day?.offEnd || day?.folgaEnd || day?.dutyDebrief || day?.endTime || day?.dutyEnd;',
  '',
  "  if (code === 'DMO') {",
  "    return when.toLowerCase() === 'hoje'",
  "      ? 'Sua escala marca luto hoje. Sinto muito. Vou ficar mais discreto e só chamar sua atenção para algo realmente importante.'",
  '      : `${when}, sua escala marca luto. Vou manter o CrewCheck discreto e sem briefing operacional de rotina.`;',
  '  }',
  "  if (code === 'VC' || code === 'FERIAS') {",
  "    return when.toLowerCase() === 'hoje'",
  "      ? 'Você está de férias hoje. O CrewCheck fica quieto e mostra só o que você pedir.'",
  '      : `${when}, sua escala marca férias. Sem programação operacional.`;',
  '  }',
  "  if (['DO', 'DOF', 'DOP', 'DOPR', 'DR', 'OFF', 'FOLGA'].includes(code)) {",
  '    if (end) return `${greeting} ${when.toLowerCase()}, sua folga termina às ${spokenTime(end)}. Depois desse horário, confirme a próxima programação publicada.`;',
  "    return when.toLowerCase() === 'hoje'",
  "      ? 'Hoje é folga. Sem programação operacional.'",
  '      : `${when} é folga. Sem programação operacional.`;',
  '  }',
  "  if (['REST', 'REPOUSO', 'DESCANSO', 'DESCANSO_REGULAMENTAR'].includes(code)) {",
  "    return when.toLowerCase() === 'hoje'",
  "      ? 'Hoje é repouso. Vou respeitar esse período e evitar briefing operacional de rotina.'",
  '      : `${when} é repouso. Sem briefing operacional de rotina.`;',
  '  }',
  '  return `${greeting} ${when.toLowerCase()}, seu dia está em branco na escala. Confirme com a escala antes de assumir que é folga.`;',
  '}',
].join('\n');
human = replaceBetweenRequired(
  human,
  'export function buildBlankDaySummary(',
  'export function buildDepartureSummary(',
  blankDayReplacement,
  'Sua escala marca luto hoje. Sinto muito.',
  'buildBlankDaySummary care-aware',
);
write(humanPath, human);

// Keep the replay source aligned for future clean materialization.
const premiumSnippetPath = 'server/v1403/premium-helpers.snippet';
let premiumSnippet = read(premiumSnippetPath);
const premiumAnchor = `    const label = mode === 'today' ? 'Hoje' : 'Amanhã';\n    const found = conciergeProgramRecords(roster).filter((record) => conciergeRecordDateKey(record) === key);\n    if (!found.length) return buildBlankDaySummary({ profile, snapshot, day: conciergeDayForKey(roster, key), label });`;
const premiumReplacement = `    const label = mode === 'today' ? 'Hoje' : 'Amanhã';\n    const day = conciergeDayForKey(roster, key);\n    const found = conciergeProgramRecords(roster).filter((record) => conciergeRecordDateKey(record) === key);\n    if (!found.length) return buildBlankDaySummary({ profile, snapshot, day, label });`;
premiumSnippet = replaceRequired(premiumSnippet, premiumAnchor, premiumReplacement, 'premium helper usa day explícito');
write(premiumSnippetPath, premiumSnippet);

await import('./refine.mjs');
console.log(`${TAG} aplicado com sucesso.`);
