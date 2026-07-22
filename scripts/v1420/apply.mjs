import fs from 'node:fs';

function update(path, transform) {
  if (!fs.existsSync(path)) return;
  const current = fs.readFileSync(path, 'utf8');
  const next = transform(current);
  if (next !== current) fs.writeFileSync(path, next, 'utf8');
}

function insertBefore(source, anchor, content) {
  if (source.includes(content.trim())) return source;
  const index = source.indexOf(anchor);
  if (index < 0) throw new Error(`[v1420] Anchor not found: ${anchor}`);
  return `${source.slice(0, index)}${content}\n${source.slice(index)}`;
}

update('server/v1403/premium-helpers.snippet', (source) => {
  let next = source;
  next = insertBefore(next, 'async function conciergeIdentityFlow', String.raw`function conciergeOnboardingIsOperationalCommand(command = '') {
  const value = normalizeConciergeButtonText(command);
  return /^\/(?:hoje|amanha|amanhã|proximo|próximo|escala|radar|portao|portão|saida|metar|taf|atis|hoteis|hotéis|hospitais|farmacias|farmácias|academias|rotina|diarias|diárias|conformidade|emergencia|emergência|ligacao|ligação|menu|ajuda)(?:@\S+)?(?:\s|$)/i.test(value)
    || matchesTodayIntent(value) || matchesTomorrowIntent(value) || matchesNextIntent(value)
    || matchesRosterSummaryIntent(value) || matchesRadarIntent(value) || matchesDepartureIntent(value)
    || /[?¿]|\b(?:qual|quando|onde|como|quanto|quantos|que horas|me diga|mostre|consulte|verifique|tenho|tenho voo|voo|escala|programa[cç][aã]o|port[aã]o|sa[ií]da|hotel|tempo|metar|taf|atis|academia|di[aá]ria|rbac|repouso|jornada|hoje|amanh[aã]|pr[oó]xim[oa])\b/i.test(value);
}

function conciergeOnboardingLooksLikeName(command = '') {
  const value = normalizeConciergeButtonText(command).trim();
  if (!value || value.startsWith('/') || value.length > 48 || /[?¿!]|\d|https?:|@/.test(value)) return false;
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 4) return false;
  if (conciergeOnboardingIsOperationalCommand(value)) return false;
  return words.every((word) => /^[A-Za-zÀ-ÖØ-öø-ÿ'’-]{2,24}$/.test(word));
}

function conciergeOnboardingExpired(preferences = {}) {
  const startedAt = new Date(preferences.onboardingStartedAt || 0).getTime();
  return !Number.isFinite(startedAt) || !startedAt || Date.now() - startedAt > 15 * 60_000;
}

async function conciergeCancelOnboarding(profile = {}, snapshot = null, message = 'Configuração de nomes cancelada. Você pode continuar usando o Concierge normalmente.', handled = true) {
  const saved = await conciergeSaveSnapshotAsync(profile, null, { preferences: { onboardingStep: 'complete', onboardingStartedAt: '', onboardingCancelledAt: new Date().toISOString() } });
  return { handled, reply: message, snapshot: saved || snapshot };
}

function conciergeRestAfterLastProgram(roster = {}, now = new Date()) {
  const records = conciergeProgramRecords(roster);
  const completed = records.filter((record) => record.end.getTime() <= now.getTime()).at(-1);
  if (!completed) return '';
  const days = Array.isArray(roster?.days) ? roster.days : [];
  const completedKey = conciergeRecordDateKey(completed);
  const candidates = days.filter((day) => {
    const key = conciergeRecordDateKey({ day });
    const code = String(day?.pairingCode || day?.type || '').toUpperCase();
    return key >= completedKey && (/PERNOITE|HOTEL|DESCANSO|REPOUSO|OFF|FOLGA|DOF|DO\b/.test(code) || day?.hotel || day?.restEnd || day?.offEnd || day?.folgaEnd);
  });
  const day = candidates[0];
  if (!day) return '';
  const code = String(day?.pairingCode || day?.type || '').toUpperCase();
  const hotel = String(day?.hotel || day?.hotelName || day?.accommodation || '').trim();
  const location = String(day?.location || day?.base || day?.airport || completed.legs?.at(-1)?.destination || '').trim();
  const until = day?.restEnd || day?.offEnd || day?.folgaEnd || day?.dutyReport || day?.startTime || '';
  const kind = /PERNOITE|HOTEL/.test(code) || hotel ? 'Pernoite' : 'Descanso';
  return [kind, location && ('em ' + location), hotel && ('no ' + hotel), until && ('até ' + conciergeTime(until, until))].filter(Boolean).join(' ');
}`);

  next = next.replace(
    "  const command = String(value || '').trim();",
    "  const command = String(value || '').trim();\n  if (/^\\/(?:cancelar|sair)(?:@\\S+)?$/i.test(command) && /^ask-/.test(String(preferences.onboardingStep || ''))) return conciergeCancelOnboarding(profile, snapshot);\n  if (/^ask-/.test(String(preferences.onboardingStep || '')) && conciergeOnboardingExpired(preferences)) return conciergeCancelOnboarding(profile, snapshot, 'A configuração de nomes expirou para não interpretar suas perguntas como nomes. Use /meunome quando quiser configurar novamente.');\n  if (/^ask-/.test(String(preferences.onboardingStep || '')) && !conciergeOnboardingLooksLikeName(command)) return conciergeCancelOnboarding(profile, snapshot, '', false);"
  );

  next = next.replaceAll(
    "preferences: { onboardingStep: 'ask-user-name', conciergeName:",
    "preferences: { onboardingStep: 'ask-user-name', onboardingStartedAt: new Date().toISOString(), conciergeName:"
  );
  next = next.replaceAll(
    "preferences: { onboardingStep: 'ask-concierge-name', conciergeName:",
    "preferences: { onboardingStep: 'ask-concierge-name', onboardingStartedAt: new Date().toISOString(), conciergeName:"
  );
  next = next.replaceAll("onboardingStep: 'complete' }", "onboardingStep: 'complete', onboardingStartedAt: '' }");
  next = next.replace(
    "return next\n    ? buildProgramSummary({ profile, snapshot, record: next, label: 'A próxima programação', presentationTime: conciergePresentationTime(next) })\n    : `${premiumGreeting(profile, snapshot)} Não encontrei uma programação futura confirmada na escala ativa.`;",
    "if (next) return buildProgramSummary({ profile, snapshot, record: next, label: 'A próxima programação', presentationTime: conciergePresentationTime(next) });\n  const rest = conciergeRestAfterLastProgram(roster);\n  return rest\n    ? `${premiumGreeting(profile, snapshot)} Todas as etapas previstas foram concluídas. Agora consta ${rest}.`\n    : `${premiumGreeting(profile, snapshot)} Não encontrei uma programação futura confirmada na escala ativa.`;"
  );
  return next;
});

update('server/v1403/telegram-human.mjs', (source) => source
  .replace("'Essas alterações são feitas somente por texto.',", "'Durante a configuração, use /cancelar para sair sem salvar. Perguntas operacionais não serão tratadas como nomes.',\n    'Essas alterações são feitas somente por texto.',"));

update('client/src/pages/Home.tsx', (source) => source
  .replace(/const DEFAULT_VERSION = '[^']+';/, "const DEFAULT_VERSION = '14.2.0';")
  .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, "const CREWCHECK_UI_CORE_NOTE = 'v14.2.0: onboarding Telegram protegido e resumo de pernoite após a jornada';"));

update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = '14.2.0';
  data.description = 'CrewCheck v14.2.0 - guarded Telegram onboarding and post-duty rest intelligence';
  data.scripts ||= {};
  data.scripts['regression:v14.2.0:telegram-onboarding'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-2-0-telegram-onboarding.mjs';
  return `${JSON.stringify(data, null, 2)}\n`;
});

console.log('[v1420] Guarded Telegram onboarding, timeout/cancel and post-duty rest summary applied.');
