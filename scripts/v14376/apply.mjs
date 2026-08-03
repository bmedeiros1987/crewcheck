import fs from 'node:fs';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[v14.3.76] arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}
function write(path, before, after) {
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}
function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v14.3.76] ponto não localizado: ${label}`);
  return source.replace(before, after);
}
function functionBlock(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = start >= 0 ? source.indexOf(endNeedle, start) : -1;
  if (start < 0 || end < 0) throw new Error(`[v14.3.76] bloco não localizado: ${startNeedle}`);
  return { start, end, value: source.slice(start, end) };
}

const platformPath = 'server/platform.mjs';
{
  const before = read(platformPath);
  let source = before;
  const marker = '// [v14.3.76] trusted linked Telegram roster sync';
  if (!source.includes(marker)) {
    const block = functionBlock(source, 'async function handleRosterSync(', '\nasync function handleRosterActive(');
    const replacement = `${marker}\nasync function syncRosterForContext(context, body = {}) {\n  const roster = sanitizeRoster(body.roster);\n  if (!Array.isArray(roster.days) || !roster.days.length) {\n    throw Object.assign(new Error('A escala não possui dias válidos.'), { status: 400, code: 'ROSTER_DAYS_REQUIRED' });\n  }\n  const firstDate = parseDateOnly(roster.days.find((day) => parseDateOnly(day?.date))?.date);\n  const inferredYear = Number(firstDate?.slice(0, 4));\n  const inferredMonth = Number(firstDate?.slice(5, 7));\n  roster.year = Number(roster.year) || inferredYear;\n  roster.month = Number(roster.month) || inferredMonth;\n  if (!Number.isInteger(roster.year) || roster.year < 2000 || roster.year > 2100 || !Number.isInteger(roster.month) || roster.month < 1 || roster.month > 12) {\n    throw Object.assign(new Error('Não foi possível confirmar mês e ano da escala.'), { status: 400, code: 'ROSTER_PERIOD_REQUIRED' });\n  }\n  const key = rosterKey(roster);\n  const id = crypto.randomUUID();\n  const compliance = body.compliance && typeof body.compliance === 'object' ? body.compliance : {};\n  const gym = Array.isArray(body.gym) ? body.gym.slice(0, 370) : [];\n  const rosterStaysByKey = new Map();\n  for (const day of roster.days) {\n    const hotelName = normalizeText(day.hotel || day.hotelName, 180);\n    const stayDate = parseDateOnly(day.date);\n    if (!hotelName || !stayDate) continue;\n    const hKey = hotelKey(hotelName);\n    rosterStaysByKey.set(\`${'${stayDate}'}|${'${hKey}'}\`, {\n      stayDate,\n      hotelKey: hKey,\n      hotelName,\n      airport: normalizeText(day.destination || day.airport, 8).toUpperCase(),\n      presentationTime: normalizeText(day.hotelPresentation || day.presentation || day.dutyReport, 10),\n    });\n  }\n  const fingerprint = rosterFingerprint(roster);\n  const saved = await saveRosterMysql(context, {\n    id, key, roster, compliance, gym,\n    sourceName: normalizeText(body.sourceName || body.sourceFileName, 180),\n    fingerprint,\n    stays: [...rosterStaysByKey.values()],\n  });\n  return {\n    saved: saved.saved,\n    roster: rosterSummary(saved.full),\n    data: { roster, compliance, gym },\n    fingerprint,\n  };\n}\n\nexport async function syncLinkedTelegramRoster(input = {}, runtime = {}) {\n  const ownerEmail = safeEmail(input.email);\n  if (!ownerEmail) return { ok: false, skipped: true, code: 'LINKED_EMAIL_REQUIRED', message: 'Conta CrewCheck vinculada não confirmada.' };\n  const db = runtime.db || await pool();\n  if (!db) return { ok: false, code: 'PLATFORM_DATABASE_UNAVAILABLE', retryable: true, message: 'Banco principal indisponível.' };\n  const profileResult = await db.query('SELECT * FROM crewcheck_platform_profiles WHERE email=$1 LIMIT 1', [ownerEmail]);\n  const profile = profileResult.rows[0] || null;\n  if (!profile) return { ok: false, code: 'LINKED_PROFILE_NOT_FOUND', retryable: false, message: 'Conta vinculada não existe no banco principal.' };\n  const context = { db, identity: { email: ownerEmail }, profile };\n  try {\n    const synced = await syncRosterForContext(context, {\n      roster: input.roster,\n      compliance: input.compliance || {},\n      gym: Array.isArray(input.gym) ? input.gym : [],\n      sourceName: input.sourceName || input.sourceFileName || 'telegram.pdf',\n    });\n    return { ok: true, databasePrimary: true, ...synced };\n  } catch (error) {\n    const status = Number(error?.status || 500);\n    return {\n      ok: false,\n      code: error?.code || 'TELEGRAM_ROSTER_SYNC_FAILED',\n      retryable: status >= 500,\n      message: status >= 500 ? 'A escala foi lida, mas a ativação no banco principal não foi confirmada.' : error?.message || 'Escala inválida para sincronização.',\n    };\n  }\n}\n\nasync function handleRosterSync(req, res) {\n  const body = await readBody(req, 4_500_000);\n  const context = await requireMain(req, res, body);\n  if (!context) return;\n  const synced = await syncRosterForContext(context, body);\n  return sendJson(res, 200, {\n    ok: true, saved: synced.saved, roster: synced.roster,\n    databasePrimary: true, message: 'Escala ativa salva no banco principal.',\n  });\n}\n`;
    source = `${source.slice(0, block.start)}${replacement}${source.slice(block.end)}`;
  }
  write(platformPath, before, source);
}

const serverPath = 'server.mjs';
{
  const before = read(serverPath);
  let source = before;
  source = replaceRequired(
    source,
    "import { handlePlatformRoute, consumePlatformUsage, refundPlatformUsage, handlePlatformVisitorTelegram } from './server/platform.mjs';",
    "import { handlePlatformRoute, consumePlatformUsage, refundPlatformUsage, handlePlatformVisitorTelegram, syncLinkedTelegramRoster } from './server/platform.mjs';",
    'import do sincronizador canônico',
  );

  const snapshotAnchor = "    const snapshot = await conciergeSaveSnapshotAsync(profile, roster, { source: 'telegram-pdf', fileName: document.file_name || 'escala.pdf', parserDiagnostics: parsed.diagnostics || null });\n    const stats = snapshot.diagnostics || conciergeRosterDiagnostics(roster);";
  const snapshotReplacement = "    const snapshot = await conciergeSaveSnapshotAsync(profile, roster, { source: 'telegram-pdf', fileName: document.file_name || 'escala.pdf', parserDiagnostics: parsed.diagnostics || null });\n    const platformSync = profile.linked\n      ? await syncLinkedTelegramRoster({ email: profile.email, roster, sourceName: document.file_name || 'escala-telegram.pdf' })\n      : { ok: false, skipped: true, code: 'TELEGRAM_ACCOUNT_NOT_LINKED' };\n    const stats = snapshot.diagnostics || conciergeRosterDiagnostics(roster);";
  source = replaceRequired(source, snapshotAnchor, snapshotReplacement, 'sincronização do PDF Telegram com a plataforma');

  const titleAnchor = "      'Escala ativada no Concierge.',";
  const titleReplacement = "      profile.linked && platformSync.ok\n        ? 'Escala ativada no CrewCheck e no Concierge.'\n        : 'Escala ativada no Concierge.',";
  source = replaceRequired(source, titleAnchor, titleReplacement, 'mensagem de ativação do Telegram');

  const nextAnchor = "      next ? `Próxima: ${conciergeProgramLabel(next)}.` : 'Não encontrei próxima programação futura nesta escala.',";
  const nextReplacement = "      next ? `Próxima: ${conciergeProgramLabel(next)}.` : 'Não encontrei próxima programação futura nesta escala.',\n      !profile.linked\n        ? 'Vincule sua conta CrewCheck ao Telegram para manter Web, PWA e aplicativo na mesma escala.'\n        : !platformSync.ok\n          ? 'A sincronização com sua conta CrewCheck não foi confirmada. Reenvie o PDF quando a conexão estiver disponível.'\n          : 'Web, PWA e aplicativo receberam a mesma revisão ativa desta escala.',";
  source = replaceRequired(source, nextAnchor, nextReplacement, 'estado de sincronização na resposta Telegram');
  write(serverPath, before, source);
}

console.log('[v14.3.76] PDF Telegram de conta vinculada usa a mesma ativação canônica do banco principal; conta não vinculada nunca grava roster de plataforma.');
