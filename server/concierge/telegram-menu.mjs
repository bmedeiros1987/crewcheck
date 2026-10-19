import { randomBytes } from 'node:crypto';

const pages = {
  home: [['📅 Hoje', 'hoje'], ['✈️ Escala', 'escala'], ['💰 Diárias', 'diarias'], ['🏨 Hotéis', 'hoteis'], ['➕ Mais', 'more']],
  more: [['📆 Amanhã', 'amanha'], ['⏭️ Próxima', 'proximo'], ['📡 Radar', 'radar'], ['🚪 Portão', 'portao'], ['🌤️ Meteorologia', 'weather'], ['🚗 Saída', 'saida'], ['🌿 Bem-estar', 'wellness'], ['📋 Revisar escala', 'conformidade'], ['⚙️ Configurações', 'configuracoes'], ['🚨 Emergência', 'emergencia'], ['↩️ Voltar', 'home'], ['🏠 Início', 'home']],
  weather: [['🌤️ METAR', 'metar'], ['🌤️ TAF', 'taf'], ['📻 ATIS', 'atis'], ['↩️ Voltar', 'more'], ['🏠 Início', 'home']],
  wellness: [['🏥 Hospitais', 'hospitais'], ['💊 Farmácias', 'farmacias'], ['🏋️ Academias', 'academias'], ['🗓️ Rotina', 'rotina'], ['↩️ Voltar', 'more'], ['🏠 Início', 'home']],
  hoteis: [['🕘 Histórico', 'historico_pernoites'], ['🏠 Início', 'home']],
  duty: [['📖 Fundamento', 'duty_basis'], ['↩️ Voltar', 'more'], ['🏠 Início', 'home']],
  duty_details: [['↩️ Voltar', 'duty_summary'], ['🏠 Início', 'home']],
};
const commands = new Set(['hoje', 'escala', 'amanha', 'proximo', 'saida', 'hospitais', 'farmacias', 'academias', 'rotina', 'informar_hotel', 'adicionar_quarto', 'historico_pernoites', 'configuracoes']);
const parameters = { radar: 'Digite o voo, por exemplo LA1234.', portao: 'Digite o voo, por exemplo LA1234.', metar: 'Digite o código ICAO do aeroporto, por exemplo SBGR.', taf: 'Digite o código ICAO do aeroporto, por exemplo SBGR.', atis: 'Digite o código ICAO do aeroporto, por exemplo SBGR.' };
const TTL = 15 * 60_000;
const MAX = 2000;
const foldMenuText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^[^\p{L}/]+/u, '').trim().toUpperCase();
const navigationNames = new Set([...Object.values(pages).flat().map(([label]) => foldMenuText(label)), 'MENU', 'AJUDA', 'HELP', 'INICIO', 'VOLTAR AO MENU', 'CONFIGURACOES', 'MINHA ESCALA']);
const priorityNavigation = value => /^\/|\bEMERGENCIA\b|^SOS\b/.test(foldMenuText(value)) || navigationNames.has(foldMenuText(value));
export const hotelsUrl = 'https://crewcheck.online/?view=hotels';
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
  if (page === 'finance') return { inline_keyboard: [[{ text: '💰 Ver Diárias', url: financeUrl }], [{ text: '↩️ Voltar', callback_data: 'cc_nav:entry:home' }, { text: '🏠 Início', callback_data: 'cc_nav:entry:home' }]] };
  const items = pages[page] || pages.home;
  const rows = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2).map(([text, action]) => ({ text, callback_data: `cc_nav:entry:${action}` })));
  if (page === 'hoteis') rows.unshift([{ text: '🏨 Abrir Hotéis no app', url: hotelsUrl }]);
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
  const factsGuard = Symbol('facts-owner');
  const navigationGuard = Symbol('navigation-owner');
  const busy = new Set();
  const promptGuard = Symbol('prompt-owner');
  const owner = profile => profile?.linked === true && profile.channel === 'telegram' && profile.chatType === 'private' && /^[^@\s]+@[^@\s]+$/.test(profile.email || '') ? `${profile.email}|${profile.accessKeyHash || ''}` : '';
  const prune = map => { for (const [key, value] of map) if (now() - value.at > TTL) map.delete(key); while (map.size >= MAX) map.delete(map.keys().next().value); };
  async function identity(message) {
    if (message?.chat?.type !== 'private' || !message?.from?.id || String(message.from.id) !== String(message.chat.id)) return null;
    const profile = await deps.profile(message);
    return owner(profile) ? profile : null;
  }
  async function markup(chatId, extra = {}) {
    const { [factsGuard]: factsContext, [navigationGuard]: navigationContext, [promptGuard]: promptContext, ...transportExtra } = extra;
    const expectedFactsOwner = factsContext?.owner || navigationContext?.owner || promptContext?.owner;
    extra = transportExtra;
    // Upgrade only newly emitted markup from current trusted producers. Incoming
    // legacy payloads still have no ticket and remain rejected by callback().
    if (extra.reply_markup?.inline_keyboard) extra = { ...extra, reply_markup: { ...extra.reply_markup,
      inline_keyboard: extra.reply_markup.inline_keyboard.map(row => row.map(button => button.callback_data === 'cc_nav:menu'
        ? { ...button, callback_data: 'cc_nav:entry:home' } : button)),
    } };
    if (extra.reply_markup?.keyboard) migrated.delete(String(chatId));
    const buttons = extra.reply_markup?.inline_keyboard?.flat() || [];
    const navigation = buttons.some(button => button.callback_data?.startsWith('cc_nav:entry:'));
    const weather = buttons.some(button => button.callback_data?.startsWith('cc_weather:'));
    if (!navigation && !weather) return extra;
    let profile = null;
    try { profile = await identity({ chat: { id: chatId, type: 'private' }, from: { id: chatId } }); } catch {
      // Public weather controls do not require an account lookup to succeed.
      // Owner-guarded output below still fails closed.
    }
    if (expectedFactsOwner && owner(profile) !== expectedFactsOwner) return null;
    if (promptContext && !currentPrompt(String(chatId), promptContext)) return null;
    if (!profile) {
      if (!navigation) return extra;
      if (!weather) return { ...extra, reply_markup: { remove_keyboard: true } };
      // Current weather keyboards mix public report controls with a private
      // Concierge return. Drop only that unavailable return, not the report UI.
      const inline_keyboard = extra.reply_markup.inline_keyboard
        .map(row => row.filter(button => !button.callback_data?.startsWith('cc_nav:')))
        .filter(row => row.length);
      return { ...extra, reply_markup: { ...extra.reply_markup, inline_keyboard } };
    }
    prune(migrated);
    const chat = String(chatId);
    if (migrated.get(chat)?.owner !== owner(profile)) {
      migrated.set(chat, { owner: owner(profile), at: now() });
      // Telegram permits one reply_markup kind per message. Remove the legacy
      // persistent reply keyboard in a separate transport call before inline UI.
      await deps.send(chatId, 'Escolha uma opção nos botões da conversa.', { reply_markup: { remove_keyboard: true } });
    }
    if (expectedFactsOwner) {
      const confirmed = await identity({ chat: { id: chatId, type: 'private' }, from: { id: chatId } });
      if (owner(confirmed) !== expectedFactsOwner) return null;
    }
    if (!navigation) return extra;
    if (promptContext && !currentPrompt(chat, promptContext)) return null;
    prune(tickets);
    const token = randomBytes(12).toString('hex');
    const actions = new Set();
    const inline_keyboard = extra.reply_markup.inline_keyboard.map(row => row.map(button => {
      if (!button.callback_data?.startsWith('cc_nav:entry:')) return button;
      const action = button.callback_data.slice('cc_nav:entry:'.length);
      actions.add(action);
      return { ...button, callback_data: `cc_nav:v1:${token}:${action}` };
    }));
    tickets.set(token, { at: now(), chat: String(chatId), owner: owner(profile), actions,
      factRevision: [...actions].some(action => action.startsWith('duty_')) ? factsContext?.signature : null,
      factPage: factsContext?.page || 0, navigation: navigationContext || null, prompt: promptContext || null });
    if (navigationContext) navigationContext.token = token;
    if (promptContext) promptContext.token = token;
    return { ...extra, reply_markup: { inline_keyboard } };
  }
  async function send(chat, text, page = 'home') { await deps.send(chat, text, { reply_markup: menuTemplate(page) }); }
  const messageId = value => Number.isSafeInteger(value) && value > 0 ? value : null;
  async function stillOwner(profile) {
    const current = await identity({ chat: { id: profile.chatId, type: 'private' }, from: { id: profile.chatId } });
    return current && owner(current) === owner(profile);
  }
  async function clearMessage(profile, id) {
    if (!deps.clear || !messageId(id) || !await stillOwner(profile)) return;
    // Keep useful content; only the consumed controls are removed. Failure does
    // not restore a ticket, so a visible old button cannot repeat its action.
    try { await deps.clear(profile.chatId, id); } catch {}
  }
  function currentPrompt(chat, prompt) {
    return prompt.active && flows.get(chat) === prompt.flow && prompt.flow.prompt === prompt
      && now() - prompt.flow.at <= TTL;
  }
  function retirePrompt(prompt) {
    if (!prompt) return null;
    prompt.active = false;
    tickets.delete(prompt.token);
    if (prompt.flow.prompt === prompt) prompt.flow.prompt = null;
    return prompt;
  }
  function takeFlow(chat, flow) {
    if (!flow || flows.get(chat) !== flow) return null;
    flows.delete(chat); // Claim synchronously before cleanup or any producer.
    return retirePrompt(flow.prompt);
  }
  async function clearPrompt(profile, prompt) {
    if (prompt) await clearMessage(profile, prompt.id);
  }
  async function ask(profile, flow, text, previous = null) {
    const chat = String(profile.chatId);
    const prompt = { flow, owner: flow.owner, active: true, id: null, date: null, token: null };
    flow.prompt = prompt; // A replacement gets its own identity before any await.
    await clearPrompt(profile, previous);
    if (!currentPrompt(chat, prompt)) return;
    const delivered = await deps.send(profile.chatId, text, { [promptGuard]: prompt,
      reply_markup: { inline_keyboard: [[{ text: '✖️ Cancelar', callback_data: 'cc_nav:entry:cancel' }]] } });
    const result = delivered?.data?.result;
    prompt.id = messageId(result?.message_id);
    prompt.date = Number.isSafeInteger(result?.date) && result.date > 0 ? result.date : null;
    if (!currentPrompt(chat, prompt)) {
      retirePrompt(prompt);
      await clearPrompt(profile, prompt); // Late delivery cannot resurrect a flow.
    } else if (delivered?.ok !== true || !prompt.id || !prompt.date) {
      takeFlow(chat, flow);
      await clearPrompt(profile, prompt);
      if (await stillOwner(profile)) await send(chat, 'Não consegui abrir a pergunta agora. Escolha a consulta novamente.');
    }
  }
  async function navigation(profile, query, ticket, text, page) {
    const context = { owner: owner(profile), text, messageId: null, token: null };
    const extra = { [navigationGuard]: context, reply_markup: menuTemplate(page) };
    const previous = ticket.navigation;
    if (deps.edit && messageId(query.message?.message_id) && previous?.messageId === messageId(query.message?.message_id)
      && previous?.text === query.message?.text && await stillOwner(profile)) {
      const decorated = await markup(profile.chatId, extra);
      if (!decorated) return;
      let result;
      try { result = await deps.edit(profile.chatId, previous.messageId, text, decorated); } catch {}
      if (result?.ok === true) { context.messageId = previous.messageId; return; }
      // An edit can fail after delivery. Retire its new token before the single
      // fallback; never leave two actionable versions of the same navigation.
      tickets.delete(context.token);
    }
    await clearMessage(profile, query.message?.message_id);
    if (!await stillOwner(profile)) return;
    const result = await deps.send(profile.chatId, text, extra);
    context.messageId = result?.ok === true ? messageId(result.data?.result?.message_id) : null;
    if (!context.messageId) tickets.delete(context.token);
  }
  async function showFacts(profile, detail = false, expected = null, page = 0) {
    if (!deps.facts) { await send(profile.chatId, missingComplianceReply()); return; }
    const current = await identity({ chat: { id: profile.chatId, type: 'private' }, from: { id: profile.chatId } });
    if (!current || owner(current) !== owner(profile)) return;
    const latest = await deps.snapshot(current);
    const confirmed = await identity({ chat: { id: profile.chatId, type: 'private' }, from: { id: profile.chatId } });
    if (!confirmed || owner(confirmed) !== owner(current)) return;
    let facts = deps.facts(current, latest, page);
    const changed = (detail && !expected) || (expected && expected !== facts.signature);
    if (changed) facts = deps.facts(current, latest, 0);
    const replyMarkup = menuTemplate(!facts.signature ? 'more' : detail && !changed ? 'duty_details' : 'duty');
    if (facts.signature && (!detail || changed) && facts.pageCount > 1) {
      const row = [];
      if (facts.page > 0) row.push({ text: '◀️ Anterior', callback_data: 'cc_nav:entry:duty_prev' });
      if (facts.page + 1 < facts.pageCount) row.push({ text: '▶️ Próxima página', callback_data: 'cc_nav:entry:duty_next' });
      replyMarkup.inline_keyboard.unshift(row);
    }
    await deps.send(profile.chatId, (changed ? 'O snapshot mudou ou não está mais disponível. Consulte esta nova leitura.\n\n' : '') + (detail && !changed ? facts.basis : facts.summary), {
      [factsGuard]: { owner: owner(current), signature: facts.signature, page: facts.page || 0 }, reply_markup: replyMarkup,
    });
  }
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
    const profile = await identity({ ...query.message, from: query.from });
    if (!profile) { await deps.answer(query.id, 'Este menu não está disponível nesta conversa.'); return true; }
    prune(tickets); prune(flows);
    const [, version, token, action] = String(query.data).split(':');
    const ticket = tickets.get(token);
    if (version !== 'v1' || !ticket || ticket.chat !== String(profile.chatId) || ticket.owner !== owner(profile) || !ticket.actions.has(action)) {
      await deps.answer(query.id, 'Este menu expirou. Escreva Ajuda para abrir um novo menu.');
      return true;
    }
    if (ticket.prompt && currentPrompt(String(profile.chatId), ticket.prompt) && ticket.prompt.id === null) {
      await deps.answer(query.id, 'Aguarde a pergunta terminar de abrir e tente novamente.');
      return true;
    }
    if (ticket.prompt && (!currentPrompt(String(profile.chatId), ticket.prompt)
      || ticket.prompt.id !== messageId(query.message?.message_id))) {
      tickets.delete(token);
      await deps.answer(query.id, 'Esta pergunta expirou ou foi substituída. Use a pergunta atual.');
      return true;
    }
    const key = `${profile.chatId}:${messageId(query.message?.message_id) || token}`;
    if (busy.has(key)) { await deps.answer(query.id, 'Aguarde a navegação terminar e tente novamente.'); return true; }
    tickets.delete(token); // Claim before any asynchronous transport or producer.
    busy.add(key);
    const chat = String(profile.chatId);
    const retired = takeFlow(chat, flows.get(chat));
    try {
      await deps.answer(query.id, '');
      await clearPrompt(profile, retired);
      if (!await stillOwner(profile)) return true;
      if (ticket.prompt) {
        await navigation(profile, query, ticket, 'Consulta cancelada.', 'home');
        return true;
      }
      if (pages[action]) {
        await navigation(profile, query, ticket, action === 'home' ? menuGreeting() : action === 'hoteis' ? 'Hotéis: abra a tela do app e selecione o pernoite para cadastrar ou editar. O link abre a versão web.' : 'Escolha uma opção:', action);
        return true;
      }
      await clearMessage(profile, query.message?.message_id);
      if (!await stillOwner(profile)) return true;
      if (action === 'conformidade') {
        await showFacts(profile);
      } else if (['duty_basis', 'duty_summary', 'duty_next', 'duty_prev'].includes(action)) {
        const page = ticket.factPage + (action === 'duty_next' ? 1 : action === 'duty_prev' ? -1 : 0);
        await showFacts(profile, action === 'duty_basis', ticket.factRevision, page);
      } else if (action === 'diarias') {
        await send(profile.chatId, missingFinanceReply(), 'finance');
      } else if (parameters[action]) {
        const flow = { owner: owner(profile), action, at: now(), prompt: null };
        flows.set(chat, flow);
        await ask(profile, flow, `${parameters[action]}\nOu toque em Cancelar.`);
      } else if (action === 'emergencia') await deps.emergency(query);
      else if (commands.has(action)) await execute(action, profile);
      return true;
    } finally { busy.delete(key); }
  }
  async function text(message = {}) {
    const chat = String(message.chat?.id || '');
    const factText = String(message.text || '').trim();
    if (deps.facts && (/^\/conformidade(?:@\w+)?(?:\s|$)/i.test(factText)
      || (!factText.startsWith('/') && /\b(?:rbac|act|irregularidade|conformidade)\b|^revisar escala$/i.test(factText)))) {
      const profile = await identity(message);
      if (!profile) return true;
      const retired = takeFlow(chat, flows.get(chat));
      await clearPrompt(profile, retired);
      await showFacts(profile);
      return true;
    }
    const flow = flows.get(chat);
    if (!flow || !message.text) return false;
    const profile = await identity(message);
    if (!profile) {
      if (message.chat?.type === 'private' && message.from?.id && String(message.from.id) === chat) takeFlow(chat, flow);
      return false;
    }
    if (owner(profile) !== flow.owner) { takeFlow(chat, flow); return false; }
    const value = String(message.text).trim().toUpperCase();
    const plain = foldMenuText(value);
    // Priority intents belong to the existing downstream routers even when the
    // user replied to another message. Only parameter answers/cancel are scoped
    // by prompt correlation; never swallow an emergency or navigation request.
    if (priorityNavigation(value) && !/^(CANCELAR|\/CANCELAR)$/.test(plain)) {
      const retired = takeFlow(chat, flow); await clearPrompt(profile, retired); return false;
    }
    if (flows.get(chat) !== flow) return true;
    const prompt = flow.prompt;
    if (message.reply_to_message && message.reply_to_message.message_id !== prompt?.id) return true;
    const followsPrompt = prompt && prompt.id !== null && Number.isSafeInteger(message.message_id)
      && Number.isSafeInteger(message.date) && message.message_id > prompt.id && message.date >= prompt.date;
    if (/^(CANCELAR|\/CANCELAR)$/.test(plain)) {
      if (!followsPrompt) return true;
      const retired = takeFlow(chat, flow); await clearPrompt(profile, retired);
      if (await stillOwner(profile)) await send(chat, 'Consulta cancelada.');
      return true;
    }
    if (now() - flow.at > TTL) {
      const retired = takeFlow(chat, flow); await clearPrompt(profile, retired);
      if (await stillOwner(profile)) await send(chat, 'Esta consulta expirou. Escolha uma opção novamente.');
      return true;
    }
    if (!followsPrompt) return true;
    const valid = ['radar', 'portao'].includes(flow.action) ? /^(LA|JJ|G3|AD|AZU|LAN|TAM)\s?\d{2,5}$/.test(value) : /^[A-Z]{4}$/.test(value);
    if (!valid) {
      const retired = retirePrompt(prompt);
      await ask(profile, flow, `${parameters[flow.action]}\nPara sair, escreva Cancelar.`, retired);
      return true;
    }
    const retired = takeFlow(chat, flow); // Duplicate input cannot claim this prompt twice.
    await clearPrompt(profile, retired);
    if (!await stillOwner(profile)) return true;
    await execute(flow.action, profile, value);
    return true;
  }
  async function interrupt(message = {}) {
    const chat = String(message.chat?.id || '');
    const flow = flows.get(chat);
    if (!flow || !priorityNavigation(message.text) || /^\/?CANCELAR$/.test(foldMenuText(message.text))) return false;
    const profile = await identity(message);
    if (!profile || flow.owner !== owner(profile) || flows.get(chat) !== flow) return false;
    const retired = takeFlow(chat, flow);
    await clearPrompt(profile, retired);
    return true;
  }
  return { markup, callback, text, interrupt };
}
