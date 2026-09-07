import fs from 'node:fs';

const VERSION = '14.4.11';
const path = 'server.mjs';
let server = fs.readFileSync(path, 'utf8');

const locationKeyboard = `function conciergeLocationActionsKeyboard() {
  return { inline_keyboard: [
    [
      { text: '🏥 Hospitais próximos', callback_data: 'cc_location:hospitals' },
      { text: '💊 Farmácias próximas', callback_data: 'cc_location:pharmacies' },
    ],
    [{ text: '🏋️ Academias próximas', callback_data: 'cc_location:gyms' }],
  ] };
}`;

if (!server.includes('function conciergeLocationActionsKeyboard()')) {
  const anchor = 'async function handleTelegramLocation(';
  if (!server.includes(anchor)) throw new Error(`CrewCheck v${VERSION}: handler de localização não localizado.`);
  server = server.replace(anchor, `${locationKeyboard}\n\n${anchor}`);
}

const oldLocationCopy = `  if (!silent) await sendTelegramMessage(chatId, [
    \`Localização atualizada: \${normalized.label}.\`,
    'Vou priorizar estas coordenadas por até 6 horas para /saida, /hospitais, /farmacias e /academias.',
    'Depois desse período pedirei um novo compartilhamento para não pesquisar na cidade errada.',
  ].join('\\n'), { reply_markup: conciergeKeyboard });`;
const newLocationCopy = `  if (!silent) await sendTelegramMessage(chatId, [
    \`📍 Localização atualizada: \${normalized.label}.\`,
    'Vou usar sua localização pelas próximas 6 horas para encontrar opções próximas e planejar seus deslocamentos.',
    'Quando ela expirar, peço uma atualização antes de fazer uma busca que dependa da sua posição.',
  ].join('\\n'), { reply_markup: conciergeLocationActionsKeyboard() });`;

if (server.includes(oldLocationCopy)) {
  server = server.replace(oldLocationCopy, newLocationCopy);
} else if (!server.includes('reply_markup: conciergeLocationActionsKeyboard()')) {
  throw new Error(`CrewCheck v${VERSION}: confirmação canônica de localização não localizada.`);
}

const callbackStart = 'async function handleTelegramNavigationCallback(update = {}) {';
const callbackEnd = 'async function handleTelegramWeatherCallback(update = {}) {';
const startIndex = server.indexOf(callbackStart);
const endIndex = server.indexOf(callbackEnd, startIndex + callbackStart.length);
if (startIndex < 0 || endIndex < 0) throw new Error(`CrewCheck v${VERSION}: callback de navegação não localizado.`);

const navigationCallback = `async function handleTelegramNavigationCallback(update = {}) {
  const callback = update?.callback_query;
  const data = String(callback?.data || '');
  if (!data.startsWith('cc_nav:') && !data.startsWith('cc_location:')) return false;
  const chatId = callback?.message?.chat?.id;
  if (!chatId) return true;
  const message = { ...(callback.message || {}), from: callback.from || callback.message?.from || {} };
  const profile = await telegramProfileForChatAsync(message);
  const snapshot = await conciergeLoadSnapshot(profile);

  if (data.startsWith('cc_location:')) {
    const action = data.slice('cc_location:'.length);
    const actions = {
      hospitals: ['Buscando hospitais próximos…', conciergeHospitalsReply],
      pharmacies: ['Buscando farmácias próximas…', conciergePharmaciesReply],
      gyms: ['Buscando academias próximas…', conciergeGymsReply],
    };
    const selected = actions[action];
    if (!selected) {
      await answerTelegramCallback(callback.id, 'Ação indisponível.');
      return true;
    }
    await answerTelegramCallback(callback.id, selected[0]);
    const reply = await selected[1](snapshot || {});
    await sendTelegramMessage(chatId, reply, { reply_markup: conciergeFunctionKeyboard });
    return true;
  }

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

const currentCallback = server.slice(startIndex, endIndex);
if (!currentCallback.includes("data.startsWith('cc_location:')")) {
  server = `${server.slice(0, startIndex)}${navigationCallback}${server.slice(endIndex)}`;
}

fs.writeFileSync(path, server, 'utf8');
console.log(`CrewCheck v${VERSION}: ações inline de localização aplicadas.`);
