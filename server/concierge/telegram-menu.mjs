import { randomBytes } from 'node:crypto';

const pages = {
  home: [['Hoje', 'hoje'], ['Escala', 'escala'], ['Diárias', 'diarias'], ['Hotéis', 'hoteis'], ['Mais', 'more']],
  more: [['Amanhã', 'amanha'], ['Próxima', 'proximo'], ['Radar', 'radar'], ['Portão', 'portao'], ['Meteorologia', 'weather'], ['Saída', 'saida'], ['Bem-estar', 'wellness'], ['Revisar escala', 'conformidade'], ['Configurações', 'configuracoes'], ['Emergência', 'emergencia'], ['Voltar', 'home'], ['Início', 'home']],
  weather: [['METAR', 'metar'], ['TAF', 'taf'], ['ATIS', 'atis'], ['Voltar', 'more'], ['Início', 'home']],
  wellness: [['Hospitais', 'hospitais'], ['Farmácias', 'farmacias'], ['Academias', 'academias'], ['Rotina', 'rotina'], ['Voltar', 'more'], ['Início', 'home']],
  hoteis: [['Informar hotel', 'informar_hotel'], ['Adicionar quarto', 'adicionar_quarto'], ['Histórico', 'historico_pernoites'], ['Voltar', 'home'], ['Início', 'home']],
};
const commands = new Set(['hoje', 'escala', 'amanha', 'proximo', 'saida', 'hospitais', 'farmacias', 'academias', 'rotina', 'informar_hotel', 'adicionar_quarto', 'historico_pernoites', 'configuracoes']);
const parameters = { radar: 'Digite o voo, por exemplo LA1234.', portao: 'Digite o voo, por exemplo LA1234.', metar: 'Digite o código ICAO do aeroporto, por exemplo SBGR.', taf: 'Digite o código ICAO do aeroporto, por exemplo SBGR.', atis: 'Digite o código ICAO do aeroporto, por exemplo SBGR.' };
const TTL = 15 * 60_000;
const MAX = 2000;
const foldMenuText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^[^\p{L}/]+/u, '').trim().toUpperCase();
const navigationNames = new Set([...Object.values(pages).flat().map(([label]) => foldMenuText(label)), 'MENU', 'AJUDA', 'HELP', 'INICIO', 'VOLTAR AO MENU', 'CONFIGURACOES', 'MINHA ESCALA']);
const priorityNavigation = value => /^\/|\bEMERGENCIA\b|^SOS\b/.test(foldMenuText(value)) || navigationNames.has(foldMenuText(value));
export const financeUrl = 'https://crewcheck.online/?view=perdiem';
export function requestedWeatherAirport(text = '', interpret) {
  const value = String(text).trim();
  const argument = value.match(/^\/(?:metar|taf|atis)(?:@\w+)?\s+([a-z]{3,4})\b/i)?.[1];
  if (argument && argument.toUpperCase() !== 'RAW') return argument.toUpperCase();
  const named = value.match(/\b(?:metar|taf|atis)\b(?:\s+(?:de|do|da|em|para|no|na|aeroporto))*\s+([a-z]{3,4})\b/i)?.[1]?.toUpperCase();
  if (named && !['METAR', 'TAF', 'ATIS', 'QUAL', 'COMO', 'ONDE', 'QUEM', 'BASE', 'CASA', 'PARA', 'VOO', 'AERO', 'RAW'].includes(named)) return named;
  return interpret(value).airport || '';
}
export const missingFinanceReply = () => `Diárias · dados financeiros indisponíveis nesta conversa\n\nA escala recebida pelo Telegram não contém os valores financeiros, moedas, datas previstas de pagamento ou status de cálculo da sua conta. Não posso calcular esses dados a partir de pernoites.\n\nConsulte a fonte financeira existente: ${financeUrl}\nEntre na sua conta para consultar valores e eventuais dados pendentes.`;
export const missingComplianceReply = () => 'Revisão da escala · dados insuficientes\n\nNão há ocorrências verificáveis neste resumo. Faltam, por ocorrência, horários com origem confirmada, duração verificável e fundamento aplicável com artigo ou cláusula, documento e vigência. Não é possível confirmar limite aplicável ou irregularidade.\n\nSem a origem dos horários, também não posso apresentá-los como fatos publicados. A análise fundamentada ainda não está disponível nesta conversa.';
export function menuTemplate(page = 'home') {
  if (page === 'finance') return { inline_keyboard: [[{ text: 'Ver Diárias', url: financeUrl }], [{ text: 'Voltar', callback_data: 'cc_nav:entry:home' }, { text: 'Início', callback_data: 'cc_nav:entry:home' }]] };
  const items = pages[page] || pages.home;
  const rows = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2).map(([text, action]) => ({ text, callback_data: `cc_nav:entry:${action}` })));
  return { inline_keyboard: rows };
}
export function menuGreeting(name = '') {
  const safe = String(name).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const first = safe.split(/\s+/)[0];
  const greeting = first && /\p{L}/u.test(first) && !/@|\d{4}/.test(first) ? `Olá, ${first}!` : 'Olá!';
  return `${greeting} Sou o Concierge CrewCheck.\n\nO que você quer consultar? Escolha abaixo.\nVocê também pode escrever sua pergunta ou enviar a escala em PDF.\n\nDiárias: valores e elegibilidade ficam no app.`;
}

// All state is bounded, ephemeral and transport-scoped. Restart invalidates old
// buttons. Callback payloads contain no account, roster or airport identifiers.
export function createTelegramMenu(deps, now = Date.now) {
  const tickets = new Map();
  const flows = new Map();
  const migrated = new Map();
  const owner = profile => profile?.linked === true && profile.channel === 'telegram' && profile.chatType === 'private' && /^[^@\s]+@[^@\s]+$/.test(profile.email || '') ? `${profile.email}|${profile.accessKeyHash || ''}` : '';
  const prune = map => { for (const [key, value] of map) if (now() - value.at > TTL) map.delete(key); while (map.size >= MAX) map.delete(map.keys().next().value); };
  async function identity(message) {
    if (message?.chat?.type !== 'private' || !message?.from?.id || String(message.from.id) !== String(message.chat.id)) return null;
    const profile = await deps.profile(message);
    return owner(profile) ? profile : null;
  }
  async function markup(chatId, extra = {}) {
    if (extra.reply_markup?.keyboard) migrated.delete(String(chatId));
    const buttons = extra.reply_markup?.inline_keyboard?.flat() || [];
    const navigation = buttons.some(button => button.callback_data?.startsWith('cc_nav:entry:'));
    const weather = buttons.some(button => button.callback_data?.startsWith('cc_weather:'));
    if (!navigation && !weather) return extra;
    const profile = await identity({ chat: { id: chatId, type: 'private' }, from: { id: chatId } });
    if (!profile) return navigation ? { ...extra, reply_markup: { remove_keyboard: true } } : extra;
    prune(migrated);
    const chat = String(chatId);
    if (migrated.get(chat)?.owner !== owner(profile)) {
      migrated.set(chat, { owner: owner(profile), at: now() });
      // Telegram permits one reply_markup kind per message. Remove the legacy
      // persistent reply keyboard in a separate transport call before inline UI.
      await deps.send(chatId, 'Escolha uma opção nos botões da conversa.', { reply_markup: { remove_keyboard: true } });
    }
    if (!navigation) return extra;
    prune(tickets);
    const token = randomBytes(12).toString('hex');
    const actions = new Set();
    const inline_keyboard = extra.reply_markup.inline_keyboard.map(row => row.map(button => {
      if (!button.callback_data?.startsWith('cc_nav:entry:')) return button;
      const action = button.callback_data.slice('cc_nav:entry:'.length);
      actions.add(action);
      return { text: button.text, callback_data: `cc_nav:v1:${token}:${action}` };
    }));
    tickets.set(token, { at: now(), chat: String(chatId), owner: owner(profile), actions });
    return { ...extra, reply_markup: { inline_keyboard } };
  }
  async function send(chat, text, page = 'home') { await deps.send(chat, text, { reply_markup: menuTemplate(page) }); }
  async function execute(action, profile, arg = '') {
    const snapshot = await deps.snapshot(profile);
    // Dispatch directly to the existing producer, never fabricate a user update.
    const reply = await deps.reply(`/${action}${arg ? ` ${arg}` : ''}`, profile, snapshot);
    if (action === 'configuracoes') {
      await deps.send(profile.chatId, reply, { reply_markup: deps.settingsKeyboard });
    } else if (action === 'metar' || action === 'taf') {
      await deps.send(profile.chatId, reply, { reply_markup: deps.weatherKeyboard(arg, action) });
    } else {
      await send(profile.chatId, reply, action === 'historico_pernoites' || action === 'informar_hotel' || action === 'adicionar_quarto' ? 'hoteis' : 'home');
    }
    if (action === 'atis') await deps.voice(profile.chatId, reply, '', snapshot);
  }
  async function callback(update = {}) {
    const query = update.callback_query;
    if (!String(query?.data || '').startsWith('cc_nav:')) return false;
    await deps.answer(query.id, '');
    const profile = await identity({ ...query.message, from: query.from });
    if (!profile) return true;
    prune(tickets); prune(flows);
    const [, version, token, action] = String(query.data).split(':');
    const ticket = tickets.get(token);
    if (version !== 'v1' || !ticket || ticket.chat !== String(profile.chatId) || ticket.owner !== owner(profile) || !ticket.actions.has(action)) {
      const chat = String(profile.chatId);
      const flow = flows.get(chat);
      // A refreshed root ends only the validated sender's own pending question;
      // neither an unrelated account nor another chat's flow is removed.
      if (flow?.owner === owner(profile)) flows.delete(chat);
      await send(profile.chatId, 'Este menu expirou. Escolha uma opção no novo menu.');
      return true;
    }
    tickets.delete(token); // Claim before any asynchronous producer; replay fails closed.
    flows.delete(String(profile.chatId));
    if (pages[action]) {
      await send(profile.chatId, action === 'home' ? menuGreeting() : action === 'hoteis' ? 'Hotéis: cadastro no app ou consulta dos registros salvos.' : 'Escolha uma opção:', action);
    } else if (action === 'conformidade') {
      await send(profile.chatId, missingComplianceReply());
    } else if (action === 'diarias') {
      await send(profile.chatId, missingFinanceReply(), 'finance');
    } else if (parameters[action]) {
      const chat = String(profile.chatId);
      const flow = { owner: owner(profile), action, at: now(), promptId: null, promptDate: null };
      flows.set(chat, flow);
      const delivered = await deps.send(profile.chatId, `${parameters[action]}\nOu toque em Cancelar.`, { reply_markup: { inline_keyboard: [[{ text: 'Cancelar', callback_data: 'cc_nav:entry:home' }]] } });
      const prompt = delivered?.data?.result;
      if (Number.isSafeInteger(prompt?.message_id) && prompt.message_id > 0 && Number.isSafeInteger(prompt?.date) && prompt.date > 0) {
        flow.promptId = prompt.message_id;
        flow.promptDate = prompt.date;
      } else {
        if (flows.get(chat) === flow) flows.delete(chat);
        await send(chat, 'Não consegui abrir a pergunta agora. Escolha a consulta novamente.');
      }
    } else if (action === 'emergencia') await deps.emergency(query);
    else if (commands.has(action)) await execute(action, profile);
    return true;
  }
  async function text(message = {}) {
    const chat = String(message.chat?.id || '');
    const flow = flows.get(chat);
    if (!flow || !message.text) return false;
    const profile = await identity(message);
    if (!profile) {
      if (message.chat?.type === 'private' && message.from?.id && String(message.from.id) === chat) flows.delete(chat);
      return false;
    }
    if (owner(profile) !== flow.owner) { flows.delete(chat); return false; }
    if (flows.get(chat) !== flow) return true;
    const value = String(message.text).trim().toUpperCase();
    const plain = foldMenuText(value);
    if (/^(CANCELAR|\/CANCELAR)$/.test(plain)) { flows.delete(chat); await send(chat, 'Consulta cancelada.'); return true; }
    if (priorityNavigation(value)) { flows.delete(chat); return false; }
    if (value.startsWith('/')) { flows.delete(chat); return false; }
    if (now() - flow.at > TTL) { flows.delete(chat); await send(chat, 'Esta consulta expirou. Escolha uma opção novamente.'); return true; }
    if (!Number.isSafeInteger(message.message_id) || !Number.isSafeInteger(message.date)
      || flow.promptId === null || message.message_id <= flow.promptId || message.date < flow.promptDate
      || (message.reply_to_message && message.reply_to_message.message_id !== flow.promptId)) return true;
    const valid = ['radar', 'portao'].includes(flow.action) ? /^(LA|JJ|G3|AD|AZU|LAN|TAM)\s?\d{2,5}$/.test(value) : /^[A-Z]{4}$/.test(value);
    if (!valid) {
      flow.promptId = null;
      flow.promptDate = null;
      const delivered = await deps.send(chat, `${parameters[flow.action]}\nPara sair, escreva Cancelar.`, { reply_markup: { inline_keyboard: [[{ text: 'Cancelar', callback_data: 'cc_nav:entry:home' }]] } });
      const prompt = delivered?.data?.result;
      if (Number.isSafeInteger(prompt?.message_id) && prompt.message_id > 0 && Number.isSafeInteger(prompt?.date) && prompt.date > 0) {
        flow.promptId = prompt.message_id;
        flow.promptDate = prompt.date;
      } else {
        if (flows.get(chat) === flow) flows.delete(chat);
        await send(chat, 'Não consegui abrir a pergunta agora. Escolha a consulta novamente.');
      }
      return true;
    }
    flows.delete(chat); // Duplicate text cannot execute the same pending flow twice.
    await execute(flow.action, profile, value);
    return true;
  }
  async function interrupt(message = {}) {
    const chat = String(message.chat?.id || '');
    const flow = flows.get(chat);
    if (!flow || !priorityNavigation(message.text) || /^\/?CANCELAR$/.test(foldMenuText(message.text))) return false;
    const profile = await identity(message);
    if (!profile || flow.owner !== owner(profile) || flows.get(chat) !== flow) return false;
    flows.delete(chat);
    return true;
  }
  return { markup, callback, text, interrupt };
}
