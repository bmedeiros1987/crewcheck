import { randomBytes } from 'node:crypto';

const pages = {
  home: [['Hoje', 'hoje'], ['Escala', 'escala'], ['Diárias', 'diarias'], ['Hotéis', 'hoteis'], ['Mais', 'more']],
  more: [['Amanhã', 'amanha'], ['Próxima', 'proximo'], ['Radar', 'radar'], ['Portão', 'portao'], ['Meteorologia', 'weather'], ['Saída', 'saida'], ['Bem-estar', 'wellness'], ['Revisar escala', 'conformidade'], ['Voltar', 'home'], ['Início', 'home']],
  weather: [['METAR', 'metar'], ['TAF', 'taf'], ['ATIS', 'atis'], ['Voltar', 'more'], ['Início', 'home']],
  wellness: [['Hospitais', 'hospitais'], ['Farmácias', 'farmacias'], ['Academias', 'academias'], ['Rotina', 'rotina'], ['Voltar', 'more'], ['Início', 'home']],
  hoteis: [['Informar hotel', 'informar_hotel'], ['Adicionar quarto', 'adicionar_quarto'], ['Histórico', 'historico_pernoites'], ['Voltar', 'home'], ['Início', 'home']],
};
const commands = new Set(['hoje', 'escala', 'amanha', 'proximo', 'saida', 'hospitais', 'farmacias', 'academias', 'rotina', 'informar_hotel', 'adicionar_quarto', 'historico_pernoites']);
const parameters = { radar: 'Digite o voo, por exemplo LA1234.', portao: 'Digite o voo, por exemplo LA1234.', metar: 'Digite o código ICAO do aeroporto, por exemplo SBGR.', taf: 'Digite o código ICAO do aeroporto, por exemplo SBGR.', atis: 'Digite o código ICAO do aeroporto, por exemplo SBGR.' };
const TTL = 15 * 60_000;
const MAX = 2000;
export function menuTemplate(page = 'home') {
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
  const owner = profile => profile?.linked === true && profile.channel === 'telegram' && profile.chatType === 'private' && /^[^@\s]+@[^@\s]+$/.test(profile.email || '') ? `${profile.email}|${profile.accessKeyHash || ''}` : '';
  const prune = map => { for (const [key, value] of map) if (now() - value.at > TTL) map.delete(key); while (map.size >= MAX) map.delete(map.keys().next().value); };
  async function identity(message) {
    if (message?.chat?.type !== 'private' || !message?.from?.id || String(message.from.id) !== String(message.chat.id)) return null;
    const profile = await deps.profile(message);
    return owner(profile) ? profile : null;
  }
  async function markup(chatId, extra = {}) {
    if (!extra.reply_markup?.inline_keyboard?.flat().some(button => button.callback_data?.startsWith('cc_nav:entry:'))) return extra;
    const profile = await identity({ chat: { id: chatId, type: 'private' }, from: { id: chatId } });
    if (!profile) return { ...extra, reply_markup: { remove_keyboard: true } };
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
    await send(profile.chatId, reply, action === 'historico_pernoites' || action === 'informar_hotel' || action === 'adicionar_quarto' ? 'hoteis' : 'home');
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
      await send(profile.chatId, 'Este menu expirou. Escolha uma opção no novo menu.');
      return true;
    }
    tickets.delete(token); // Claim before any asynchronous producer; replay fails closed.
    flows.delete(String(profile.chatId));
    if (pages[action]) {
      await send(profile.chatId, action === 'home' ? menuGreeting() : action === 'hoteis' ? 'Hotéis: cadastro no app ou consulta dos registros salvos.' : 'Escolha uma opção:', action);
    } else if (action === 'conformidade') {
      await send(profile.chatId, 'Revisão da escala incompleta\n\nEste resumo ainda não recebe o fundamento aplicável, artigo ou cláusula, documento e vigência por ocorrência. Por isso não posso apresentar limite de jornada ou repouso como aplicável nem concluir irregularidade. A integração com a análise fundamentada está pendente.');
    } else if (action === 'diarias') {
      await send(profile.chatId, 'Diárias\n\nNo app CrewCheck, abra Diárias para consultar valores, critérios e elegibilidade. O Telegram ainda não oferece essa consulta financeira. Pernoites operacionais ficam em Hotéis.');
    } else if (parameters[action]) {
      flows.set(String(profile.chatId), { owner: owner(profile), action, at: now() });
      await deps.send(profile.chatId, `${parameters[action]}\nOu toque em Cancelar.`, { reply_markup: { inline_keyboard: [[{ text: 'Cancelar', callback_data: 'cc_nav:entry:home' }]] } });
    } else if (commands.has(action)) await execute(action, profile);
    return true;
  }
  async function text(message = {}) {
    const chat = String(message.chat?.id || '');
    const flow = flows.get(chat);
    if (!flow || !message.text) return false;
    const profile = await identity(message);
    if (!profile || owner(profile) !== flow.owner || now() - flow.at > TTL) { flows.delete(chat); return false; }
    if (flows.get(chat) !== flow) return true;
    const value = String(message.text).trim().toUpperCase();
    if (/^(CANCELAR|\/CANCELAR|\/MENU|INÍCIO)$/.test(value)) { flows.delete(chat); await send(chat, 'Consulta cancelada.'); return true; }
    if (value.startsWith('/')) { flows.delete(chat); return false; }
    const valid = ['radar', 'portao'].includes(flow.action) ? /^(LA|JJ|G3|AD|AZU|LAN|TAM)\s?\d{2,5}$/.test(value) : /^[A-Z]{4}$/.test(value);
    if (!valid) { await deps.send(chat, `${parameters[flow.action]}\nPara sair, escreva Cancelar.`, { reply_markup: { inline_keyboard: [[{ text: 'Cancelar', callback_data: 'cc_nav:entry:home' }]] } }); return true; }
    flows.delete(chat); // Duplicate text cannot execute the same pending flow twice.
    await execute(flow.action, profile, value);
    return true;
  }
  return { markup, callback, text };
}
