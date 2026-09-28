import fs from 'node:fs';

const VERSION = '14.0.3';
const path = 'server.mjs';
let server = fs.readFileSync(path, 'utf8');
const navigationFile = 'server/v1403/navigation-callback.snippet';
if (!fs.existsSync(navigationFile)) throw new Error(`CrewCheck v${VERSION}: callback de navegação ausente.`);

if (!server.includes("preferences: { conciergeName: DEFAULT_CONCIERGE_NAME, onboardingStep: 'ask-user-name' }")) {
  server = server.replace(
    "await conciergeMergeChatSnapshot({ email, name: pending.name || '', chatId: String(chatId), accessKeyHash: pending.accessKeyHash || '' });\n  await sendTelegramMessage(chatId, [\n    'Telegram vinculado ao CrewCheck.',",
    "await conciergeMergeChatSnapshot({ email, name: pending.name || '', chatId: String(chatId), accessKeyHash: pending.accessKeyHash || '' });\n  await conciergeSaveSnapshotAsync({ email, name: pending.name || '', chatId: String(chatId), accessKeyHash: pending.accessKeyHash || '' }, null, { preferences: { conciergeName: DEFAULT_CONCIERGE_NAME, onboardingStep: 'ask-user-name' } });\n  await sendTelegramMessage(chatId, [\n    `Telegram vinculado. Eu sou ${DEFAULT_CONCIERGE_NAME}, o concierge da sua escala.`,",
  );
  server = server
    .replace(
      "'Você já pode enviar o PDF da escala aqui e consultar programação, radar, meteorologia, hotéis, academias, rotina e Saída Inteligente.',",
      "'Antes de começar, como você gostaria que eu chamasse você? Responda somente por texto com seu nome ou apelido.',",
    )
    .replace(
      "'Use /ajuda para ver os comandos antigos restaurados. Para testar alertas, volte ao CrewCheck e use Despertador > Testar canal.'",
      "'Depois disso, eu libero o menu completo e respondo de forma mais natural.'",
    );
}

if (!server.includes("command: 'configuracoes'")) {
  server = server.replace(
    "{ command: 'ajuda', description: 'Todos os comandos' },",
    "{ command: 'configuracoes', description: 'Nome e preferências do concierge' },\n    { command: 'ajuda', description: 'Todos os comandos' },",
  );
}

if (!/function conciergeWeatherKeyboard[\s\S]*?cc_nav:menu[\s\S]*?async function handleTelegramWeatherCallback/.test(server)) {
  server = server.replace(
    "{ text: '🔊 ATIS em voz', callback_data: `cc_weather:atis:${icao}:both` },\n    ],\n  ] };",
    "{ text: '🔊 ATIS em voz', callback_data: `cc_weather:atis:${icao}:both` },\n    ],\n    [{ text: '⬅️ Voltar ao menu', callback_data: 'cc_nav:menu' }],\n  ] };",
  );
}
if (!/function conciergeCallConfirmationKeyboard[\s\S]*?cc_nav:menu[\s\S]*?async function requestConciergeCallConfirmation/.test(server)) {
  server = server.replace(
    "{ text: 'Cancelar', callback_data: 'cc_call:cancel' },\n  ]] };",
    "{ text: 'Cancelar', callback_data: 'cc_call:cancel' },\n  ], [{ text: '⬅️ Voltar ao menu', callback_data: 'cc_nav:menu' }]] };",
  );
}

if (!server.includes('async function handleTelegramNavigationCallback(update = {})')) {
  const anchor = 'async function handleTelegramWeatherCallback(update = {}) {';
  if (!server.includes(anchor)) throw new Error(`CrewCheck v${VERSION}: callback meteorológico não localizado.`);
  server = server.replace(anchor, `${fs.readFileSync(navigationFile, 'utf8').trim()}\n${anchor}`);
}
if (!server.includes("channel: 'navigation-button'")) {
  server = server.replace(
    "if (await handleTelegramWeatherCallback(update)) return sendJson(res, 200, { ok: true, handled: true, channel: 'weather-button' });",
    "if (await handleTelegramNavigationCallback(update)) return sendJson(res, 200, { ok: true, handled: true, channel: 'navigation-button' });\n  if (await handleTelegramWeatherCallback(update)) return sendJson(res, 200, { ok: true, handled: true, channel: 'weather-button' });",
  );
}

server = server
  .replace(
    "await sendTelegramMessage(chatId, reply, { reply_markup: isWeather ? conciergeWeatherKeyboard(weatherStation, /taf/i.test(normalizedText) ? 'taf' : 'metar') : conciergeKeyboard });",
    "await sendTelegramMessage(chatId, reply, { reply_markup: isWeather ? conciergeWeatherKeyboard(weatherStation, /taf/i.test(normalizedText) ? 'taf' : 'metar') : conciergeReplyKeyboard(normalizedText) });",
  )
  .replace(
    "await sendTelegramMessage(chatId, [`Ouvi: “${transcript.slice(0, 700)}”`, '', reply].join('\\n'));",
    "await sendTelegramMessage(chatId, reply, { reply_markup: conciergeReplyKeyboard(normalizeConciergeButtonText(transcript)) });",
  )
  .replace(
    "await sendTelegramMessage(chatId, 'Localização atualizada. Agora posso calcular /saida e procurar /hospitais, /farmacias ou /academias perto de você.', { reply_markup: conciergeKeyboard });",
    "await sendTelegramMessage(chatId, `${premiumGreeting(profile, await conciergeLoadSnapshot(profile) || {})} localização atualizada. Agora consigo calcular a Saída Inteligente e fazer buscas perto de você.`, { reply_markup: conciergeFunctionKeyboard });",
  )
  .replace(
    "form.append('prompt', 'CrewCheck, escala, voo, reserva, sobreaviso, pernoite, METAR, TAF, portão, radar, BSB, GRU, CGH, CNF, GIG, SDU, CWB, POA, REC, FOR, SLZ, SSA.');",
    "form.append('prompt', 'Conversa natural em português do Brasil sobre escala de tripulante. Reconheça horas como 12:30, apresentação, término de chave, número de pernas, voos LATAM, Gol e Azul, reserva, sobreaviso, pernoite, portão, radar, Saída Inteligente, BSB, GRU, CGH, CNF, GIG, SDU, CWB, POA, REC, FOR, SLZ e SSA.');",
  )
  .replace(
    'nativeVoiceNotes: true, conciseVoiceOnly: true, locationDirectoriesTextOnly: true, atisSupported: true',
    'nativeVoiceNotes: true, conciseVoiceOnly: true, naturalPortugueseVoice: true, flightLegInterpretation: true, spokenTimeInterpretation: true, textOnlyIdentitySettings: true, backNavigation: true, locationDirectoriesTextOnly: true, atisSupported: true',
  );

fs.writeFileSync(path, server, 'utf8');
console.log(`CrewCheck v${VERSION}: navegação, onboarding e áudio natural aplicados.`);
