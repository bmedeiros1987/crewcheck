import fs from 'node:fs';

const VERSION = '14.0.3';
const VERSION_CODE = '140003';
const read = (path) => fs.readFileSync(path, 'utf8');
const write = (path, content) => fs.writeFileSync(path, content, 'utf8');

function replaceRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`CrewCheck v${VERSION}: ponto não localizado — ${label}.`);
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

const serverPath = 'server.mjs';
if (!fs.existsSync(serverPath)) throw new Error(`CrewCheck v${VERSION}: server.mjs não encontrado.`);
let server = read(serverPath);

const importAnchor = "import { buildInfobipTtsRequest, infobipConfiguration, infobipPublicStatus } from './server/v1396/infobip.mjs';";
const premiumImport = "import { DEFAULT_CONCIERGE_NAME, airportName, buildBlankDaySummary, buildConciergeSettingsReply, buildDepartureSummary, buildProgramSummary, cleanDisplayName, isPremiumConcierge, preferredConciergeName, preferredUserName, premiumGreeting, premiumVoicePolicy, premiumVoiceText, spokenTime } from './server/v1403/telegram-human.mjs';";
if (!server.includes(premiumImport)) {
  if (!server.includes(importAnchor)) throw new Error(`CrewCheck v${VERSION}: import do Infobip não localizado.`);
  server = server.replace(importAnchor, `${importAnchor}\n${premiumImport}`);
}

server = server
  .replace("|| 0.48),", "|| 0.34),")
  .replace("|| 0.78),", "|| 0.86),")
  .replace("|| 0.18),", "|| 0.32),")
  .replace("const policy = telegramVoiceReplyPolicy(replyText, transcript);", "const policy = premiumVoicePolicy(replyText, transcript, Math.max(420, Math.min(700, Number(envAny(['TELEGRAM_CONCIERGE_MAX_VOICE_CHARS', 'CREWCHECK_TELEGRAM_MAX_VOICE_CHARS']) || 650))));")
  .replace("const finalReply = humanizeTelegramVoiceText(replyText);", "const finalReply = premiumVoiceText(replyText);")
  .replace("await showHumanRecordingAction(chatId, 2);", "await showHumanRecordingAction(chatId, 1);");

const keyboardPattern = /const conciergeKeyboard = \{[\s\S]*?\n\};\nfunction normalizeConciergeButtonText\(value = ''\) \{[\s\S]*?\n\}/;
const keyboardReplacement = `const conciergeKeyboard = {
  keyboard: [
    [{ text: '✈️ Próxima programação' }, { text: '📅 Hoje' }],
    [{ text: '🛫 Radar / portão' }, { text: '🚗 Saída inteligente' }],
    [{ text: '🗓 Minha escala' }, { text: '🧘 Rotina' }],
    [{ text: '🏨 Hotéis' }, { text: '🏥 Hospitais' }],
    [{ text: '💊 Farmácias' }, { text: '🏋️ Academias' }],
    [{ text: '🌦️ ATIS / METAR' }, { text: '📞 Solicitar ligação' }],
    [{ text: '⚙️ Configurações' }, { text: '🚨 Emergência' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  one_time_keyboard: false,
  input_field_placeholder: 'Pergunte naturalmente sobre a sua escala…',
};
const conciergeFunctionKeyboard = {
  keyboard: [
    [{ text: '⬅️ Voltar ao menu' }],
    [{ text: '✈️ Próxima programação' }, { text: '🚗 Saída inteligente' }],
    [{ text: '🛫 Radar / portão' }, { text: '⚙️ Configurações' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  one_time_keyboard: false,
  input_field_placeholder: 'Faça outra pergunta ou volte ao menu…',
};
const conciergeSettingsKeyboard = {
  keyboard: [
    [{ text: '✏️ Como me chamar' }, { text: '🪪 Nome do concierge' }],
    [{ text: '⬅️ Voltar ao menu' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  one_time_keyboard: false,
  input_field_placeholder: 'As configurações são alteradas somente por texto…',
};
function normalizeConciergeButtonText(value = '') {
  const text = String(value || '').trim();
  const normalized = text.replace(/^\\p{Extended_Pictographic}\\uFE0F?\\s*/u, '').trim().toLowerCase();
  if (normalized === 'próxima programação' || normalized === 'proxima programacao' || normalized === 'próximo voo' || normalized === 'proximo voo') return '/proximo';
  if (normalized === 'hoje') return '/hoje';
  if (normalized.includes('radar') || normalized.includes('portão')) return '/radar';
  if (normalized.includes('saída inteligente') || normalized.includes('saida inteligente')) return '/saida';
  if (normalized === 'minha escala') return '/escala';
  if (normalized === 'rotina') return '/rotina';
  if (normalized === 'hotéis' || normalized === 'hoteis') return '/hoteis';
  if (normalized === 'hospitais' || normalized.includes('pronto atendimento') || normalized.includes('pronto-socorro')) return '/hospitais';
  if (normalized === 'farmácias' || normalized === 'farmacias') return '/farmacias';
  if (normalized === 'academias') return '/academias';
  if (normalized.includes('atis')) return '/metar';
  if (normalized.includes('solicitar ligação') || normalized.includes('solicitar ligacao')) return '/ligacao';
  if (normalized.includes('emergência') || normalized.includes('emergencia')) return '/emergencia';
  if (normalized.includes('configurações') || normalized.includes('configuracoes')) return '/configuracoes';
  if (normalized.includes('como me chamar')) return '/meunome';
  if (normalized.includes('nome do concierge')) return '/nomeconcierge';
  if (normalized.includes('voltar ao menu') || normalized === 'voltar' || normalized === 'menu') return '/menu';
  if (normalized === 'ajuda') return '/ajuda';
  return text;
}`;
server = replaceRequired(server, keyboardPattern, keyboardReplacement, 'teclado do concierge');

const requestUserPattern = /function telegramRequestUser\(req, body = \{\}\) \{[\s\S]*?\n\}/;
const requestUserReplacement = `function telegramRequestUser(req, body = {}) {
  let email = String(body.email || '').trim().toLowerCase();
  let name = String(body.name || '').trim();
  let role = String(body.rank || body.role || '').trim();
  let premiumAccess = Boolean(body.premiumAccess);
  let subscriptionPlan = String(body.subscriptionPlan || '').trim();
  let subscriptionStatus = String(body.subscriptionStatus || '').trim();
  const accessKeyHash = conciergeAccessHash(body.conciergeKey || body.accessKey || req?.headers?.['x-crewcheck-concierge-key'] || '');
  let authenticated = false;
  try {
    if (typeof cc1371Verify === 'function' && typeof cc1371RequestToken === 'function') {
      const payload = cc1371Verify(cc1371RequestToken(req));
      const tokenEmail = String(payload?.email || '').trim().toLowerCase();
      if (tokenEmail) {
        email = tokenEmail;
        name = String(payload?.name || '').trim() || name;
        role = String(payload?.rank || payload?.role || payload?.function || '').trim() || role;
        premiumAccess = Boolean(payload?.premiumAccess || payload?.admin || premiumAccess);
        subscriptionPlan = String(payload?.subscriptionPlan || payload?.plan || '').trim() || subscriptionPlan;
        subscriptionStatus = String(payload?.subscriptionStatus || '').trim() || subscriptionStatus;
        authenticated = true;
      }
    }
  } catch {}
  if (!email) email = 'local@crewcheck.local';
  if (!name) name = email.includes('@') ? email.split('@')[0] : 'Tripulante CrewCheck';
  return { email, name, role, rank: role, premiumAccess, subscriptionPlan, subscriptionStatus, authenticated, accessKeyHash };
}`;
server = replaceRequired(server, requestUserPattern, requestUserReplacement, 'identidade do usuário Telegram');

const premiumHelpersMarker = '// CrewCheck v14.0.3 — Concierge humano, natural e personalizável.';
if (!server.includes(premiumHelpersMarker)) {
  const buildAnchor = 'async function buildTelegramConciergeReply(text = \'\', profile = {}, snapshot = null) {';
  if (!server.includes(buildAnchor)) throw new Error(`CrewCheck v${VERSION}: builder do concierge não localizado.`);
  const helperBlock = `${premiumHelpersMarker}
function conciergeDayForKey(roster = {}, key = '') {
  return (Array.isArray(roster?.days) ? roster.days : []).find((day) => conciergeRecordDateKey({ day }) === key) || null;
}
function conciergeReplyKeyboard(value = '') {
  if (/^\\/(?:start|ajuda|help|comandos|menu)(?:@\\S+)?$/i.test(value)) return conciergeKeyboard;
  if (/^\\/(?:configuracoes|meunome|nomeconcierge)(?:@\\S+)?/i.test(value)) return conciergeSettingsKeyboard;
  return conciergeFunctionKeyboard;
}
async function conciergeIdentityFlow(text = '', profile = {}, snapshot = null) {
  const value = normalizeConciergeButtonText(text);
  const preferences = snapshot?.preferences || {};
  const premium = isPremiumConcierge(snapshot || {}, profile || {}) || Boolean(typeof cc1371IsAdmin === 'function' && cc1371IsAdmin(String(profile?.email || '').toLowerCase()));
  const command = String(value || '').trim();
  const natural = command.replace(/^\\/(?:meunome|nomeconcierge)\\s*/i, '').trim();
  const asksSettings = /^\\/configuracoes(?:@\\S+)?$/i.test(command);
  const asksUserName = /^\\/meunome(?:@\\S+)?(?:\\s|$)/i.test(command) || /^(?:me chama de|pode me chamar de)\\s+/i.test(command);
  const asksConciergeName = /^\\/nomeconcierge(?:@\\S+)?(?:\\s|$)/i.test(command) || /^nome do concierge\\s+/i.test(command);
  if (asksSettings) return { handled: true, reply: buildConciergeSettingsReply(profile, snapshot || {}), snapshot };
  if (asksUserName) {
    const proposed = cleanDisplayName(natural || command.replace(/^(?:me chama de|pode me chamar de)\\s+/i, ''), '');
    if (!proposed) {
      const saved = await conciergeSaveSnapshotAsync(profile, null, { preferences: { onboardingStep: 'ask-user-name', conciergeName: preferences.conciergeName || DEFAULT_CONCIERGE_NAME } });
      return { handled: true, reply: 'Como você gostaria que eu chamasse você? Escreva somente o nome ou apelido.', snapshot: saved || snapshot };
    }
    const nextStep = premium && !preferences.conciergeNameConfirmed ? 'ask-concierge-name' : 'complete';
    const saved = await conciergeSaveSnapshotAsync(profile, null, { preferences: { preferredName: proposed, conciergeName: preferences.conciergeName || DEFAULT_CONCIERGE_NAME, onboardingStep: nextStep } });
    const follow = premium
      ? `Eu começo usando ${preferredConciergeName(saved || snapshot || {})}. Você pode manter esse nome ou escrever “nome do concierge” seguido do novo nome.`
      : `Eu vou usar ${DEFAULT_CONCIERGE_NAME} como nome do concierge. A troca desse nome fica disponível no plano Premium.`;
    return { handled: true, reply: `Fechado, ${proposed}. Vou chamar você assim daqui pra frente. ${follow}`, snapshot: saved || snapshot };
  }
  if (asksConciergeName) {
    if (!premium) return { handled: true, reply: `Por enquanto, meu nome é ${DEFAULT_CONCIERGE_NAME}. A personalização do nome do concierge é um recurso Premium e é feita somente por texto.`, snapshot };
    const proposed = cleanDisplayName(natural || command.replace(/^nome do concierge\\s+/i, ''), '');
    if (!proposed) {
      const saved = await conciergeSaveSnapshotAsync(profile, null, { preferences: { onboardingStep: 'ask-concierge-name', conciergeName: preferences.conciergeName || DEFAULT_CONCIERGE_NAME } });
      return { handled: true, reply: `Qual nome você quer usar para o concierge? O nome atual é ${preferredConciergeName(saved || snapshot || {})}.`, snapshot: saved || snapshot };
    }
    const saved = await conciergeSaveSnapshotAsync(profile, null, { preferences: { conciergeName: proposed, conciergeNameConfirmed: true, onboardingStep: 'complete' } });
    return { handled: true, reply: `Combinado. A partir de agora, o concierge se chama ${proposed}. Essa configuração fica salva no seu perfil Premium.`, snapshot: saved || snapshot };
  }
  if (preferences.onboardingStep === 'ask-user-name' && command && !command.startsWith('/')) {
    const proposed = cleanDisplayName(command, '');
    const nextStep = premium ? 'ask-concierge-name' : 'complete';
    const saved = await conciergeSaveSnapshotAsync(profile, null, { preferences: { preferredName: proposed, conciergeName: preferences.conciergeName || DEFAULT_CONCIERGE_NAME, onboardingStep: nextStep } });
    const follow = premium
      ? `Eu sou ${DEFAULT_CONCIERGE_NAME}. Quer manter esse nome ou prefere outro? Escreva “nome do concierge” seguido do nome escolhido.`
      : `Eu sou ${DEFAULT_CONCIERGE_NAME}. No Premium, você pode trocar meu nome pelas configurações em texto.`;
    return { handled: true, reply: `Boa, ${proposed}. Vou chamar você assim. ${follow}`, snapshot: saved || snapshot };
  }
  if (preferences.onboardingStep === 'ask-concierge-name' && command && !command.startsWith('/')) {
    if (!premium) {
      const saved = await conciergeSaveSnapshotAsync(profile, null, { preferences: { conciergeName: DEFAULT_CONCIERGE_NAME, onboardingStep: 'complete' } });
      return { handled: true, reply: `Tudo certo. Vou continuar como ${DEFAULT_CONCIERGE_NAME}.`, snapshot: saved || snapshot };
    }
    const proposed = /manter|bruno saraiva/i.test(command) ? DEFAULT_CONCIERGE_NAME : cleanDisplayName(command, DEFAULT_CONCIERGE_NAME);
    const saved = await conciergeSaveSnapshotAsync(profile, null, { preferences: { conciergeName: proposed, conciergeNameConfirmed: true, onboardingStep: 'complete' } });
    return { handled: true, reply: `Perfeito. Pode me chamar de ${proposed}. Agora é só perguntar sobre a sua escala.`, snapshot: saved || snapshot };
  }
  if ((!preferences.preferredName || !preferences.onboardingStep) && /^\\/(?:start|ajuda|help|comandos)(?:@\\S+)?$/i.test(command)) {
    const saved = await conciergeSaveSnapshotAsync(profile, null, { preferences: { onboardingStep: 'ask-user-name', conciergeName: preferences.conciergeName || DEFAULT_CONCIERGE_NAME } });
    return { handled: true, reply: `Oi! Eu sou ${DEFAULT_CONCIERGE_NAME}, o concierge da sua escala. Antes da gente começar: como você gostaria que eu chamasse você? Responda somente por texto com seu nome ou apelido.`, snapshot: saved || snapshot };
  }
  return { handled: false, snapshot };
}
async function conciergePremiumScheduleReply(snapshot, mode = 'next', profile = {}) {
  const roster = snapshot?.roster;
  if (!roster?.days?.length) return `${premiumGreeting(profile, snapshot || {})} ainda não tenho uma escala ativa. Envie o PDF oficial ou sincronize pelo app.`;
  if (mode === 'summary') {
    const stats = conciergeRosterDiagnostics(roster);
    const next = conciergeNextProgram(roster);
    return `${premiumGreeting(profile, snapshot)} sua escala tem ${stats.flights} pernas distribuídas em ${stats.programs} programações. ${next ? buildProgramSummary({ profile, snapshot, record: next, label: 'A próxima programação', presentationTime: conciergePresentationTime(next) }) : 'Não encontrei uma programação futura confirmada.'}`;
  }
  if (mode === 'today' || mode === 'tomorrow') {
    const offset = mode === 'tomorrow' ? 86_400_000 : 0;
    const key = conciergeDateKey(new Date(Date.now() + offset));
    const label = mode === 'today' ? 'Hoje' : 'Amanhã';
    const found = conciergeProgramRecords(roster).filter((record) => conciergeRecordDateKey(record) === key);
    if (!found.length) return buildBlankDaySummary({ profile, snapshot, day: conciergeDayForKey(roster, key), label });
    return found.map((record, index) => buildProgramSummary({ profile: index ? {} : profile, snapshot, record, label: index ? 'Na sequência' : label, presentationTime: conciergePresentationTime(record) })).join('\n');
  }
  const next = conciergeNextProgram(roster);
  return next
    ? buildProgramSummary({ profile, snapshot, record: next, label: 'A próxima programação', presentationTime: conciergePresentationTime(next) })
    : `${premiumGreeting(profile, snapshot)} não encontrei uma programação futura confirmada na escala ativa.`;
}
async function conciergePremiumDepartureReply(snapshot, profile = {}) {
  const roster = snapshot?.roster;
  const record = conciergeProgramRecords(roster).find((item) => {
    if (item.end < new Date()) return false;
    if (item.legs?.length) return true;
    return !conciergeRemoteCodes.has(item.code) && ['ASB', 'MT', 'CRM', 'CBF', 'EMER'].some((code) => item.code === code || item.code.startsWith(code));
  });
  if (!record) return buildDepartureSummary({ profile, snapshot });
  const presentation = conciergePresentationTime(record);
  const presentationDate = conciergeProgramDate(record.day, presentation || record.startTime);
  const origin = record.legs?.[0]?.origin || record.day?.base || '';
  const location = snapshot?.preferences?.location;
  if (!location) return buildDepartureSummary({ profile, snapshot, record, origin, presentationTime: presentation });
  const route = await conciergeTravelEstimate(location, origin);
  if (!route) return buildDepartureSummary({ profile, snapshot, record, origin, presentationTime: presentation });
  if (route.distanceKm > 250) return `${premiumGreeting(profile, snapshot)} você está longe de ${airportName(origin)}. Para esse deslocamento, revise a rota completa no app antes de considerar o horário da apresentação, que é às ${spokenTime(presentation)}.`;
  const bufferMinutes = 25;
  const leave = new Date(presentationDate.getTime() - (route.minutes + bufferMinutes) * 60_000);
  const leaveTime = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(leave);
  let radar = null;
  const firstLeg = record.legs?.[0];
  if (firstLeg && conciergeRecordDateKey(record) === conciergeDateKey(new Date())) {
    radar = await runRadarRace(buildFlightContext(firstLeg.flightNumber), firstLeg.origin || '', firstLeg.destination || '');
    if (snapshot && radar?.ok) {
      conciergeApplyRadar(snapshot, { record, leg: firstLeg }, radar);
      await conciergeSaveSnapshotAsync(profile, snapshot.roster, { source: snapshot.source || 'departure-radar', lastRadar: { ...radar, updatedAt: new Date().toISOString() } });
    }
  }
  return buildDepartureSummary({ profile, snapshot, record, route, leaveTime, origin, radar, presentationTime: presentation });
}
`;
  server = server.replace(buildAnchor, `${helperBlock}\n${buildAnchor}`);
}

const buildReplyPattern = /async function buildTelegramConciergeReply\(text = '', profile = \{\}, snapshot = null\) \{[\s\S]*?\n\}\nasync function handleParsePdfApi/;
const buildReplyReplacement = `async function buildTelegramConciergeReply(text = '', profile = {}, snapshot = null) {
  const value = normalizeConciergeButtonText(text);
  const lower = value.toLowerCase();
  const identity = await conciergeIdentityFlow(value, profile, snapshot);
  if (identity.handled) return identity.reply;
  snapshot = identity.snapshot || snapshot;
  if (!value || /^\\/(?:start|ajuda|help|comandos|menu)(?:@\\S+)?$/i.test(value) || /^(ajuda|comandos)$/i.test(value)) return conciergeHelp(preferredUserName(profile, snapshot || {}));
  if (/^\\/(?:hoje)(?:@\\S+)?\\b/i.test(value) || /\\b(programa[cç][aã]o|escala)\\s+(de\\s+)?hoje\\b/i.test(lower)) return conciergePremiumScheduleReply(snapshot, 'today', profile);
  if (/^\\/(?:amanha|amanhã)(?:@\\S+)?\\b/i.test(value) || /\\b(programa[cç][aã]o|escala)\\s+(de\\s+)?amanh[ãa]\\b/i.test(lower)) return conciergePremiumScheduleReply(snapshot, 'tomorrow', profile);
  if (/^\\/(?:proximo|próximo)(?:@\\S+)?\\b/i.test(value) || /pr[oó]xima\\s+(programa[cç][aã]o|escala|atividade|voo)/i.test(lower)) return conciergePremiumScheduleReply(snapshot, 'next', profile);
  if (/^\\/escala(?:@\\S+)?\\b/i.test(value) || /resumo\\s+(da\\s+)?escala/i.test(lower)) return conciergePremiumScheduleReply(snapshot, 'summary', profile);
  if (/^\\/(?:portao|portão|radar)(?:@\\S+)?\\b/i.test(value) || /\\b(port[aã]o|gate|radar|status\\s+do\\s+voo)\\b/i.test(lower)) return conciergeRadarReply(value, profile, snapshot);
  if (/^\\/(?:alertameteo|alertasmeteo)(?:@\\S+)?\\b/i.test(value)) return conciergeWeatherAlertsReply(value, profile, snapshot);
  if (/^\\/atis(?:@\\S+)?\\b/i.test(value) || /\\b(atis)\\b/i.test(lower)) return conciergeAtisReply(value, snapshot);
  if (/^\\/(?:metar|taf)(?:@\\S+)?\\b/i.test(value) || /\\b(metar|taf|meteorologia)\\b/i.test(lower)) return conciergeWeatherReply(value, snapshot);
  if (/^\\/saida(?:@\\S+)?\\b/i.test(value) || /\\b(que horas devo sair|sa[ií]da inteligente|hora de sair)\\b/i.test(lower)) return conciergePremiumDepartureReply(snapshot, profile);
  if (/^\\/(?:hoteis|hotéis|hotel)(?:@\\S+)?\\b/i.test(value) || /\\b(hotel|hot[eé]is|pernoite)\\b/i.test(lower)) return conciergeHotelsReply(snapshot);
  if (/^\\/academias?(?:@\\S+)?\\b/i.test(value) || /\\b(academia|wellhub|gympass|smart fit|treino perto)\\b/i.test(lower)) return conciergeGymsReply(snapshot);
  if (/^\\/rotina(?:@\\S+)?\\b/i.test(value) || /\\b(rotina|recupera[cç][aã]o|treino hoje)\\b/i.test(lower)) return conciergeRoutineReply(snapshot);
  if (/^\\/diarias?(?:@\\S+)?\\b/i.test(value) || /\\bdi[aá]rias?\\b/i.test(lower)) return conciergePerDiemReply(snapshot);
  if (/^\\/conformidade(?:@\\S+)?\\b/i.test(value) || /\\b(rbac|act|irregularidade|conformidade)\\b/i.test(lower)) return conciergeComplianceReply(snapshot);
  if (/onde.*(estou|localiza)|perto de mim/i.test(lower)) return snapshot?.preferences?.location ? 'Localização recebida. Escolha a função que deseja consultar.' : 'Envie sua localização pelo clipe do Telegram para ativar busca próxima e Saída Inteligente.';
  return `Não peguei exatamente o que você quer. Pode escrever de outro jeito ou voltar ao menu para escolher uma função.`;
}
async function handleParsePdfApi`;
server = replaceRequired(server, buildReplyPattern, buildReplyReplacement, 'interpretação natural do concierge');

server = server.replace(
  "const snapshot = await conciergeSaveSnapshotAsync(profile, roster, { source: String(body.source || 'app'), fileName: String(body.fileName || ''), diagnostics: body.diagnostics || null });",
  "const snapshot = await conciergeSaveSnapshotAsync(profile, roster, { source: String(body.source || 'app'), fileName: String(body.fileName || ''), diagnostics: body.diagnostics || null, premiumAccess: user.premiumAccess, subscriptionPlan: user.subscriptionPlan, subscriptionStatus: user.subscriptionStatus, preferences: { premiumAccess: user.premiumAccess, subscriptionPlan: user.subscriptionPlan, subscriptionStatus: user.subscriptionStatus, userRole: user.role || body.rank || body.role || '', conciergeName: existingSnapshot?.preferences?.conciergeName || DEFAULT_CONCIERGE_NAME } });",
);
server = server.replace(
  "const snapshot = await conciergeSaveSnapshotAsync(profile, roster, { source: 'telegram-pdf', fileName: document.file_name || 'escala.pdf', parserDiagnostics: parsed.diagnostics || null });",
  "const snapshot = await conciergeSaveSnapshotAsync(profile, roster, { source: 'telegram-pdf', fileName: document.file_name || 'escala.pdf', parserDiagnostics: parsed.diagnostics || null, preferences: { conciergeName: (await conciergeLoadSnapshot(profile))?.preferences?.conciergeName || DEFAULT_CONCIERGE_NAME } });",
);

server = server.replace(
  "await conciergeMergeChatSnapshot({ email, name: pending.name || '', chatId: String(chatId), accessKeyHash: pending.accessKeyHash || '' });\n  await sendTelegramMessage(chatId, [\n    'Telegram vinculado ao CrewCheck.',",
  "await conciergeMergeChatSnapshot({ email, name: pending.name || '', chatId: String(chatId), accessKeyHash: pending.accessKeyHash || '' });\n  await conciergeSaveSnapshotAsync({ email, name: pending.name || '', chatId: String(chatId), accessKeyHash: pending.accessKeyHash || '' }, null, { preferences: { conciergeName: DEFAULT_CONCIERGE_NAME, onboardingStep: 'ask-user-name' } });\n  await sendTelegramMessage(chatId, [\n    `Telegram vinculado. Eu sou ${DEFAULT_CONCIERGE_NAME}, o concierge da sua escala.`,",
);
server = server.replace(
  "'Você já pode enviar o PDF da escala aqui e consultar programação, radar, meteorologia, hotéis, academias, rotina e Saída Inteligente.',",
  "'Antes de começar, como você gostaria que eu chamasse você? Responda somente por texto com seu nome ou apelido.',",
);
server = server.replace(
  "'Use /ajuda para ver os comandos antigos restaurados. Para testar alertas, volte ao CrewCheck e use Despertador > Testar canal.'",
  "'Depois disso, eu libero o menu completo e respondo de forma mais natural.'",
);

server = server.replace(
  "{ command: 'ajuda', description: 'Todos os comandos' },",
  "{ command: 'configuracoes', description: 'Nome e preferências do concierge' },\n    { command: 'ajuda', description: 'Todos os comandos' },",
);

server = server.replace(
  "{ text: '🔊 ATIS em voz', callback_data: `cc_weather:atis:${icao}:both` },\n    ],\n  ] };",
  "{ text: '🔊 ATIS em voz', callback_data: `cc_weather:atis:${icao}:both` },\n    ],\n    [{ text: '⬅️ Voltar ao menu', callback_data: 'cc_nav:menu' }],\n  ] };",
);
server = server.replace(
  "{ text: 'Cancelar', callback_data: 'cc_call:cancel' },\n  ]] };",
  "{ text: 'Cancelar', callback_data: 'cc_call:cancel' },\n  ], [{ text: '⬅️ Voltar ao menu', callback_data: 'cc_nav:menu' }]] };",
);

if (!server.includes('async function handleTelegramNavigationCallback(update = {})')) {
  const navAnchor = 'async function handleTelegramWeatherCallback(update = {}) {';
  const navBlock = `async function handleTelegramNavigationCallback(update = {}) {
  const callback = update?.callback_query;
  const data = String(callback?.data || '');
  if (!data.startsWith('cc_nav:')) return false;
  const chatId = callback?.message?.chat?.id;
  if (!chatId) return true;
  const message = { ...(callback.message || {}), from: callback.from || callback.message?.from || {} };
  const profile = await telegramProfileForChatAsync(message);
  const snapshot = await conciergeLoadSnapshot(profile);
  if (data === 'cc_nav:settings') {
    await answerTelegramCallback(callback.id, 'Abrindo configurações…');
    await sendTelegramMessage(chatId, buildConciergeSettingsReply(profile, snapshot || {}), { reply_markup: conciergeSettingsKeyboard });
    return true;
  }
  await answerTelegramCallback(callback.id, 'Voltando ao menu…');
  await sendTelegramMessage(chatId, conciergeHelp(preferredUserName(profile, snapshot || {})), { reply_markup: conciergeKeyboard });
  return true;
}
`;
  if (!server.includes(navAnchor)) throw new Error(`CrewCheck v${VERSION}: callback meteorológico não localizado.`);
  server = server.replace(navAnchor, `${navBlock}${navAnchor}`);
}
server = server.replace(
  "if (await handleTelegramWeatherCallback(update)) return sendJson(res, 200, { ok: true, handled: true, channel: 'weather-button' });",
  "if (await handleTelegramNavigationCallback(update)) return sendJson(res, 200, { ok: true, handled: true, channel: 'navigation-button' });\n  if (await handleTelegramWeatherCallback(update)) return sendJson(res, 200, { ok: true, handled: true, channel: 'weather-button' });",
);

server = server.replace(
  "await sendTelegramMessage(chatId, reply, { reply_markup: isWeather ? conciergeWeatherKeyboard(weatherStation, /taf/i.test(normalizedText) ? 'taf' : 'metar') : conciergeKeyboard });",
  "await sendTelegramMessage(chatId, reply, { reply_markup: isWeather ? conciergeWeatherKeyboard(weatherStation, /taf/i.test(normalizedText) ? 'taf' : 'metar') : conciergeReplyKeyboard(normalizedText) });",
);
server = server.replace(
  "await sendTelegramMessage(chatId, [`Ouvi: “${transcript.slice(0, 700)}”`, '', reply].join('\\n'));",
  "await sendTelegramMessage(chatId, reply, { reply_markup: conciergeReplyKeyboard(normalizeConciergeButtonText(transcript)) });",
);
server = server.replace(
  "await sendTelegramMessage(chatId, 'Localização atualizada. Agora posso calcular /saida e procurar /hospitais, /farmacias ou /academias perto de você.', { reply_markup: conciergeKeyboard });",
  "await sendTelegramMessage(chatId, `${premiumGreeting(profile, await conciergeLoadSnapshot(profile) || {})} localização atualizada. Agora consigo calcular a Saída Inteligente e fazer buscas perto de você.`, { reply_markup: conciergeFunctionKeyboard });",
);

server = server
  .replace("form.append('prompt', 'CrewCheck, escala, voo, reserva, sobreaviso, pernoite, METAR, TAF, portão, radar, BSB, GRU, CGH, CNF, GIG, SDU, CWB, POA, REC, FOR, SLZ, SSA.');", "form.append('prompt', 'Conversa natural em português do Brasil sobre escala de tripulante. Reconheça horas como 12:30, apresentação, término de chave, número de pernas, voos LATAM, Gol e Azul, reserva, sobreaviso, pernoite, portão, radar, Saída Inteligente, BSB, GRU, CGH, CNF, GIG, SDU, CWB, POA, REC, FOR, SLZ e SSA.');")
  .replace("nativeVoiceNotes: true, conciseVoiceOnly: true, locationDirectoriesTextOnly: true, atisSupported: true", "nativeVoiceNotes: true, conciseVoiceOnly: true, naturalPortugueseVoice: true, flightLegInterpretation: true, spokenTimeInterpretation: true, textOnlyIdentitySettings: true, backNavigation: true, locationDirectoriesTextOnly: true, atisSupported: true");

for (const metadataPath of ['package.json', 'package-lock.json']) {
  if (!fs.existsSync(metadataPath)) continue;
  const metadata = JSON.parse(read(metadataPath));
  metadata.version = VERSION;
  if (metadataPath === 'package.json') {
    metadata.name = 'crewcheck-v14-0-3-premium-human-telegram-concierge';
    metadata.description = 'CrewCheck v14.0.3 - concierge Telegram natural, personalizado, objetivo e com navegação Premium';
    metadata.scripts = metadata.scripts || {};
    metadata.scripts['regression:v14.0.3:telegram-human'] = 'node scripts/regression-v14-0-3-telegram-human-concierge.mjs';
  }
  if (metadata.packages?.['']) {
    metadata.packages[''].name = 'crewcheck-v14-0-3-premium-human-telegram-concierge';
    metadata.packages[''].version = VERSION;
  }
  write(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
}

const homePath = 'client/src/pages/Home.tsx';
if (fs.existsSync(homePath)) {
  let home = read(homePath);
  home = home.replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`);
  home = home.replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, "const CREWCHECK_UI_CORE_NOTE = 'v14.0.3: concierge Telegram humano, natural, personalizado e com navegação Premium';");
  write(homePath, home);
}

const manifestPath = 'client/public/manifest.json';
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(read(manifestPath));
  manifest.version = VERSION;
  const startUrl = String(manifest.start_url || '/');
  manifest.start_url = /([?&]v=)[^&]+/.test(startUrl) ? startUrl.replace(/([?&]v=)[^&]+/, `$1${VERSION}`) : `${startUrl}${startUrl.includes('?') ? '&' : '?'}v=${VERSION}`;
  write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

const androidPath = 'android-wrapper/app/build.gradle';
if (fs.existsSync(androidPath)) {
  let android = read(androidPath);
  android = android.replace(/versionCode\s+\d+\b/, `versionCode ${VERSION_CODE}`);
  android = android.replace(/versionName\s+'[^']+'/, `versionName '${VERSION}'`);
  write(androidPath, android);
}

server = server.replace(/version\s*:\s*'(?:13\.9\.\d+|14\.0\.\d+)'/g, `version:'${VERSION}'`);
write(serverPath, server);

for (const required of ['server/v1403/telegram-human.mjs']) {
  if (!fs.existsSync(required)) throw new Error(`CrewCheck v${VERSION}: arquivo obrigatório ausente: ${required}`);
}

console.log(`CrewCheck v${VERSION}: concierge Telegram natural, personalizado, objetivo e com navegação Premium aplicado.`);
