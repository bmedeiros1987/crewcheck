import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, value) { fs.writeFileSync(path, value, 'utf8'); }
function requireAnchor(text, anchor, label) {
  if (!text.includes(anchor)) throw new Error(`v13.9.0: âncora não encontrada em ${label}`);
}
function patch(path, transform) {
  const before = read(path);
  const after = transform(before);
  if (after !== before) {
    write(path, after);
    console.log(`v13.9.0 patch: ${path}`);
  }
}
function insertAfter(text, anchor, value, marker, label) {
  if (text.includes(marker)) return text;
  requireAnchor(text, anchor, label);
  return text.replace(anchor, `${anchor}\n${value}`);
}

patch('server.mjs', (source) => {
  source = insertAfter(
    source,
    "import { handlePlatformRoute, consumePlatformUsage, handlePlatformVisitorTelegram } from './server/platform.mjs';",
    "import { handleV139Route, handleV139Telegram } from './server/v139/index.mjs';",
    "from './server/v139/index.mjs'",
    'server import',
  );
  const urlAnchor = "  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);";
  source = insertAfter(source, urlAnchor, '  if (await handleV139Route(req, res, url)) return;', 'await handleV139Route(req, res, url)', 'server route');
  const telegramAnchor = "  if (chatId && text && await telegramTryBindFromWebhook(message, text)) return sendJson(res, 200, { ok: true, linked: true, message: 'Telegram vinculado.' });";
  source = insertAfter(
    source,
    telegramAnchor,
    "  if (chatId && message?.document && await handleV139Telegram(message, sendTelegramMessage)) return sendJson(res, 200, { ok: true, crewlock: true, message: 'Solicitação CrewLock processada.' });",
    'await handleV139Telegram(message, sendTelegramMessage)',
    'Telegram CrewLock',
  );
  return source.replaceAll('13.8.8', '13.9.0');
});

patch('client/src/lib/authClient.ts', (source) => {
  if (!source.includes("delivery: 'email' | 'telegram' | 'both' | 'telegram-call'")) {
    const signature = 'export async function requestPasswordReset(email: string): Promise<{ ok: boolean; emailSent?: boolean; emailStatus?: unknown }> {';
    requireAnchor(source, signature, 'authClient reset signature');
    source = source.replace(
      signature,
      "export async function requestPasswordReset(email: string, delivery: 'email' | 'telegram' | 'both' | 'telegram-call' = 'both'): Promise<{ ok: boolean; emailSent?: boolean; emailStatus?: unknown }> {",
    );
    const functionStart = source.indexOf('export async function requestPasswordReset');
    const functionEnd = source.indexOf('\n}\n', functionStart);
    const block = source.slice(functionStart, functionEnd + 3);
    requireAnchor(block, 'body: JSON.stringify({ email }),', 'authClient reset payload');
    source = source.slice(0, functionStart) + block.replace('body: JSON.stringify({ email }),', 'body: JSON.stringify({ email, delivery }),') + source.slice(functionEnd + 3);
  }
  return source;
});

patch('client/src/pages/Home.tsx', (source) => {
  source = insertAfter(
    source,
    "import { CREW_HOTEL_CATALOG, type CrewHotelCatalogEntry } from '@/data/crewHotels';",
    [
      "import BidsWindowsView from '@/components/v139/BidsWindowsView';",
      "import CrewLockView from '@/components/v139/CrewLockView';",
      "import RoutineIntelligenceView from '@/components/v139/RoutineIntelligenceView';",
    ].join('\n'),
    "@/components/v139/BidsWindowsView",
    'Home imports',
  );
  if (!source.includes("| 'bids' | 'crewlock' |")) {
    requireAnchor(source, "| 'bids' | 'admin';", 'Home ZeroView');
    source = source.replace("| 'bids' | 'admin';", "| 'bids' | 'crewlock' | 'admin';");
  }
  if (!source.includes("['crewlock','CrewLock'")) {
    const menu = "['bids','BIDS','Preferências para a próxima escala',CalendarDays],";
    requireAnchor(source, menu, 'Home menu BIDS');
    source = source.replace(menu, `${menu} ['crewlock','CrewLock','Documentos privados e criptografados',Lock],`);
  }
  source = source.replace("'regulation','bids','admin','maintenance'", "'regulation','bids','crewlock','admin','maintenance'");
  source = source.replace("{view === 'bids' && <BidsView events={events}/>}", "{view === 'bids' && <BidsWindowsView/>}");
  source = source.replace("{view === 'routine' && <RoutineView bundle={bundle}/>}", "{view === 'routine' && <RoutineIntelligenceView events={events}/>}");
  if (!source.includes("view === 'crewlock' && <CrewLockView")) {
    const route = "    {view === 'bids' && <BidsWindowsView/>}";
    requireAnchor(source, route, 'Home CrewLock route');
    source = source.replace(route, `${route}\n    {view === 'crewlock' && <CrewLockView/>}`);
  }
  return source.replaceAll('13.8.8', '13.9.0');
});

patch('client/src/lib/canonicalRoster.ts', (source) => {
  source = insertAfter(
    source,
    "import type { CrewRoster, FlightLeg, RosterDay } from './pdfParser';",
    "import { completeContinuityDays } from './rosterContinuity';",
    "from './rosterContinuity'",
    'canonical continuity import',
  );
  if (!source.includes('const grace = 3 * 86400000;')) {
    const range = "  const start = range.start.getTime();\n  const end = range.end.getTime();";
    requireAnchor(source, range, 'canonical range');
    source = source.replace(range, "  const grace = 3 * 86400000;\n  const start = range.start.getTime() - grace;\n  const end = range.end.getTime() + grace;");
  }
  if (!source.includes('const completedDays = completeContinuityDays')) {
    const normalize = '  const normalizedDays = filterDaysByPublishedRange(collectedDays, roster, period.month, period.year);';
    requireAnchor(source, normalize, 'canonical normalized days');
    source = source.replace(normalize, "  const completedDays = completeContinuityDays(collectedDays, roster);\n  const normalizedDays = filterDaysByPublishedRange(completedDays, roster, period.month, period.year);");
  }
  const oldKind = "    const kind: CanonicalRosterEventKind = ['DO', 'DOF', 'DR', 'OFF'].includes(type) ? 'rest' : (day.hotel ? 'stay' : 'duty');";
  if (source.includes(oldKind)) {
    source = source.replace(oldKind, "    const kind: CanonicalRosterEventKind = ['DO', 'DOF', 'DOP', 'DOPR', 'DR', 'OFF', 'VC'].includes(type) ? 'rest' : (day.hotel || /PERNOITE|LAYOVER|ESTADIA|HOTEL/.test(type) ? 'stay' : 'duty');");
  }
  return source;
});

patch('server/platform.mjs', (source) => {
  source = source.replace("const APP_VERSION = '13.8.8';", "const APP_VERSION = '13.9.0';");
  if (!source.includes("DELETE FROM crewcheck_platform_documents WHERE owner_email=$1")) {
    const anchor = "    await client.query('DELETE FROM crewcheck_platform_subscriptions WHERE email=$1', [context.identity.email]);";
    requireAnchor(source, anchor, 'platform account deletion');
    const deletes = [
      "    await client.query('DELETE FROM crewcheck_platform_document_access WHERE owner_email=$1', [context.identity.email]);",
      "    await client.query('DELETE FROM crewcheck_platform_document_deletion_queue WHERE owner_email=$1', [context.identity.email]);",
      "    await client.query('DELETE FROM crewcheck_platform_documents WHERE owner_email=$1', [context.identity.email]);",
      "    await client.query('DELETE FROM crewcheck_platform_bid_windows WHERE owner_email=$1', [context.identity.email]);",
      "    await client.query('DELETE FROM crewcheck_platform_password_resets WHERE email=$1', [context.identity.email]);",
      "    await client.query('DELETE FROM crewcheck_platform_accounts WHERE email=$1', [context.identity.email]);",
    ].join('\n');
    source = source.replace(anchor, `${deletes}\n${anchor}`);
  }
  return source;
});

if (fs.existsSync('render.yaml')) {
  patch('render.yaml', (source) => source.replace('      - key: CREWCHECK_AUTO_MIGRATE\n        value: true', '      - key: CREWCHECK_AUTO_MIGRATE\n        value: false'));
}

if (fs.existsSync('.env.example')) {
  patch('.env.example', (source) => {
    if (source.includes('CREWCHECK_PASSWORD_RESET_ENABLED=')) return source;
    return `${source.trimEnd()}\n\n# CrewCheck v13.9.0 — Recovery, BIDS and CrewLock\nCREWCHECK_PASSWORD_RESET_ENABLED=true\nCREWCHECK_PASSWORD_RESET_CODE_MINUTES=10\nCREWCHECK_EMAIL_FALLBACK_ENABLED=true\nCREWCHECK_EMAIL_DISABLE_SMTP=false\nSMTP_HOST=\nSMTP_PORT=587\nSMTP_SECURE=false\nSMTP_USER=\nSMTP_PASS=\nCREWCHECK_SCHEDULER_SECRET=\nCREWCHECK_CREWLOCK_ENABLED=true\nCREWCHECK_CREWLOCK_ADMIN_BYPASS_QUOTA=true\nCREWCHECK_CREWLOCK_FREE_MAX_FILE_MB=5\nCREWCHECK_CREWLOCK_FREE_TOTAL_MB=25\nCREWCHECK_CREWLOCK_PREMIUM_MAX_FILE_MB=20\nCREWCHECK_CREWLOCK_PREMIUM_TOTAL_MB=500\n`;
  });
}

console.log('CrewCheck v13.9.0 source preparation complete.');
