import { whatsappTextMenu } from './whatsapp-text-menu.mjs';
import { operationalQuestion } from './operational-question.mjs';
import { dbPool, safeEmail } from '../v139/common.mjs';

const PAGE_SIZE = 5;
const MAX_PAGE = 24;
const clean = (value, max = 180) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const fold = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '').trim();

// Only exact menu requests belong here. A hotel mentioned as a search reference
// must continue to the nearby resolver, and arbitrary room text is never saved.
export function stayMenuIntent(text = '') {
  const value = fold(text).replace(/^(\/\w+)@\w+(?=\s|$)/, '$1');
  if (/^(?:\/(?:hoteis|hotel)(?:\s.*)?|\/(?:pernoite|meupernoite)|hoteis|meu pernoite|pernoite)$/.test(value)) return { kind: 'menu' };
  if (/^(?:\/(?:registrar_pernoite|informar_hotel)|registrar (?:o )?pernoite|informar (?:o )?hotel)$/.test(value)) return { kind: 'hotel' };
  if (/^(?:\/adicionar_quarto|adicionar (?:o )?quarto)$/.test(value)) return { kind: 'room' };
  const history = value.match(/^(?:\/(?:historico_pernoites|pernoites_registrados)|historico de pernoites|pernoites registrados)(?:\s+(\d+))?$/);
  if (history) return { kind: 'history', page: Math.min(MAX_PAGE, Math.max(1, Number(history[1] || 1))) };
  // Bounded logistics questions only. Nearby searches and hospital requests keep
  // their existing routes. No position is inferred from current time.
  const operational = operationalQuestion(text);
  if (operational?.kind === 'logistics-question') return operational;
  const question = value.replace(/[?.!]+$/, '').trim();
  let subject = null;
  if (/^qual (?:e )?(?:o )?(?:meu )?hotel(?: do (?:meu )?pernoite)?$/.test(question)) subject = 'hotel';
  if (/^que horas (?:eu )?(?:chego|saio|me apresento) (?:no|ao|do) hotel$/.test(question)) subject = 'hotel-time';
  if (/^(?:que horas (?:a )?van (?:me )?(?:busca|pega|sai)|qual (?:e )?(?:o )?horario da van)(?: (?:do aeroporto (?:para|pro) (?:o )?hotel|do hotel (?:para|pro) (?:o )?aeroporto))?$/.test(question)) subject = 'pickup';
  if (/^ate (?:que horas|quando) (?:eu )?(?:posso |devo )?esperar (?:a )?van$/.test(question)) subject = 'wait';
  if (/^(?:qual (?:e )?(?:o )?(?:contato|telefone|whatsapp) da van|contato da van)$/.test(question)) subject = 'contact';
  if (subject) {
    const direction = /do aeroporto (?:para|pro) (?:o )?hotel$/.test(question) ? 'airport-hotel'
      : /do hotel (?:para|pro) (?:o )?aeroporto$/.test(question) ? 'hotel-airport' : null;
    return { kind: 'logistics-question', subject, direction };
  }
  return null;
}

export function privateStayMenuOwner(profile = {}) {
  const email = safeEmail(profile.email);
  if (!email) return '';
  if (profile.channel === 'app' && profile.authenticated === true) return email;
  if (profile.channel === 'whatsapp' && profile.linked === true) return email;
  if (profile.channel === 'telegram' && profile.linked === true && profile.chatType === 'private' && /^\d+$/.test(String(profile.chatId || ''))) return email;
  return '';
}

function dateOnly(value) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text ? text : '';
}

// The database DATE stays a civil date: no host-timezone conversion and no
// "current" status derived from date proximity. Never load/decrypt a room here.
export async function readStayMenuHistory(email, page = 1, getPool = dbPool) {
  const owner = safeEmail(email);
  if (!owner) throw new Error('STAY_HISTORY_OWNER_REQUIRED');
  const db = await getPool();
  if (!db) throw new Error('STAY_HISTORY_UNAVAILABLE');
  const offset = (Math.min(MAX_PAGE, Math.max(1, Math.trunc(Number(page)) || 1)) - 1) * PAGE_SIZE;
  const [rows] = await db.query(
    `SELECT DATE_FORMAT(stay_date,'%Y-%m-%d') AS stay_date,hotel_name,airport
     FROM crewcheck_platform_stays
     WHERE owner_email=? AND hotel_name IS NOT NULL AND hotel_name<>''
     ORDER BY stay_date DESC,updated_at DESC,id DESC LIMIT ? OFFSET ?`,
    [owner, PAGE_SIZE + 1, offset],
  );
  return { records: (rows || []).slice(0, PAGE_SIZE).map(row => ({ date: dateOnly(row.stay_date), hotel: clean(row.hotel_name), airport: clean(row.airport, 8) })), hasMore: rows.length > PAGE_SIZE && offset + PAGE_SIZE < MAX_PAGE * PAGE_SIZE };
}

const appPath = 'No app CrewCheck, abra Menu → Hotéis → “Pesquisar hotel ou informar dados”.';
const hotelHandoff = `${appPath}\nSelecione a data e o pernoite certo, toque em “Informar manualmente” e preencha o hotel. O quarto é opcional. Confira os dados antes de tocar em “Salvar hotel”.\n\nO cadastro por esta conversa ainda não está disponível.`;
const roomHandoff = `${appPath}\nSelecione o pernoite e toque em “Editar pernoite”. Confira a data e o hotel, preencha o quarto desta estadia e toque em “Salvar hotel”.\n\nO quarto é opcional. Não use o quarto de uma estadia anterior. O cadastro por esta conversa ainda não está disponível.`;

export async function stayMenuReply(text, profile = {}, deps = {}) {
  const textMenu = whatsappTextMenu(text, profile);
  if (textMenu?.reply) return { handled: true, reply: textMenu.reply };
  const intent = stayMenuIntent(textMenu?.text || text);
  if (!intent) return textMenu?.text ? { handled: false, text: textMenu.text } : { handled: false };
  if (intent.kind === 'logistics-question') {
    const replies = {
      apz: 'Você quer a apresentação no aeroporto, a APZ no hotel ou a saída da van? São horários distintos. Informe qual deles deseja; não tenho fonte confirmada de hotel ou pickup nesta leitura.',
      hotel: 'O hotel desta estadia não está confirmado nesta leitura. Qual é a data e o aeroporto do pernoite?',
      'hotel-time': 'Horário no hotel não confirmado. A chegada do voo é ao aeroporto; não informa chegada, saída ou apresentação no hotel.',
      wait: 'Prazo máximo de espera da van não confirmado. Confirme com o transporte operacional da empresa.',
      contact: 'Não há contato operacional da van autorizado para compartilhamento nesta leitura.',
    };
    const reply = intent.subject === 'pickup'
      ? intent.direction ? `Pickup ${intent.direction === 'airport-hotel' ? 'aeroporto → hotel' : 'hotel → aeroporto'} não confirmado nesta leitura. Confira data, fuso e situação da reserva na fonte operacional.`
        : 'Você quer a van do aeroporto para o hotel ou do hotel para o aeroporto? O pickup ainda não está confirmado nesta leitura.'
      : replies[intent.subject];
    return { handled: true, reply };
  }
  if (intent.kind === 'hotel') return { handled: true, reply: hotelHandoff };
  if (intent.kind === 'room') return { handled: true, reply: roomHandoff };
  if (intent.kind === 'menu') return { handled: true, reply: [
    '🏨 Meu pernoite',
    'Para consultar o pernoite atual ou próximo pela escala, abra Hotéis no app CrewCheck.',
    'Digite uma opção:\n• Informar hotel — cadastro no app\n• Adicionar quarto — opcional, no app\n• Histórico de pernoites — consultar registros salvos',
  ].join('\n\n') };
  const owner = privateStayMenuOwner(profile);
  if (!owner) return { handled: true, reply: 'Consulte seu histórico no app autenticado ou na conversa privada vinculada ao CrewCheck.' };
  try {
    const result = await (deps.readHistory || readStayMenuHistory)(owner, intent.page);
    const records = Array.isArray(result?.records) ? result.records.slice(0, PAGE_SIZE) : [];
    if (!records.length) return { handled: true, reply: `${intent.page === 1 ? 'Você ainda não tem pernoites registrados.' : 'Não há mais registros nesta página.'}\n\nDigite “Informar hotel” para ver como cadastrar no app.` };
    return { handled: true, reply: [
      `📚 Histórico de pernoites · página ${intent.page}`,
      ...records.map(row => `• ${dateOnly(row.date) ? dateOnly(row.date).split('-').reverse().join('/') : 'Data não confirmada'} · ${clean(row.hotel) || 'Hotel não informado'}${clean(row.airport, 8) ? ` · ${clean(row.airport, 8)}` : ''}`),
      '',
      'São registros salvos; a lista não confirma onde você está agora. Quartos ficam fora deste resumo.',
      result.hasMore && intent.page < MAX_PAGE ? `Mais registros: /historico_pernoites ${intent.page + 1}` : '',
      'Para voltar, digite “Meu pernoite”.',
    ].filter(Boolean).join('\n') };
  } catch {
    return { handled: true, reply: 'Não consegui consultar o histórico de pernoites agora. Tente novamente em instantes ou consulte Hotéis no app CrewCheck.' };
  }
}
