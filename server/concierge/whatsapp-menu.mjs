export function whatsappMenuEnabled(environment = process.env) {
  return environment.CREWCHECK_WHATSAPP_MENU_ENABLED === 'true';
}

// Channel adapter only: facts remain owned by the existing Concierge engine.
export const WHATSAPP_MENU = [
  'CrewCheck — o que você quer consultar?',
  'Hoje — programação de hoje',
  'Amanhã — programação de amanhã',
  'Escala — resumo da escala ativa',
  'Diárias — valores calculados da escala',
  'Próxima programação — próximo compromisso publicado',
  'Pernoite — hotel e descanso publicados',
  'Farmácias — locais e rotas',
  'Digite uma opção ou faça sua pergunta por aqui. Para voltar, digite “menu”.',
].join('\n');

const normalize = value => String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const commands = new Map([
  ['amanha', '/amanha'], ['escala', '/escala'], ['minha escala', '/escala'],
  ['diarias', '/diarias'],
  ['hoje', '/hoje'], ['minha programacao', '/hoje'],
  ['proxima programacao', '/proximo'], ['proximo', '/proximo'],
  ['pernoite', '/pernoite'], ['farmacias', '/farmacias'], ['farmacia', '/farmacias'],
]);
const menuRequest = value => /^(?:\/(?:start|menu|ajuda|help)|menu|ajuda|voltar|voltar ao menu)$/.test(normalize(value));
const active = link => Boolean(link?.email && link?.linked_at && !link.revoked_at && Number(link.consent_concierge) === 1);
const identity = link => JSON.stringify([normalize(link.email), String(link.linked_at)]);

/** Only called after the existing signed webhook, deduplication and code-link flow. */
export async function deliverWhatsAppMenuMessage(message, { findLink, handler, send }) {
  const from = String(message?.from || '').replace(/\D/g, '');
  if (!/^\d{8,16}$/.test(from)) return { sent: false, reason: 'invalid_sender' };
  const link = await findLink(from);
  if (!active(link)) {
    if (!link?.email) {
      const result = await send(from, 'Para proteger sua escala, vincule este WhatsApp à sua conta CrewCheck usando “Vincular WhatsApp”. Depois você pode consultar sua programação por aqui.', { replyToMessageId: message.id });
      return { sent: Boolean(result?.ok), reason: 'link_required' };
    }
    return { sent: false, reason: 'not_linked_or_consented' };
  }
  // Re-check authorization after any asynchronous engine work. A revoked link,
  // changed account or renewed binding must never receive an old account's reply.
  const deliver = async text => {
    const current = await findLink(from);
    if (!active(current) || identity(current) !== identity(link)) return { sent: false, reason: 'link_changed' };
    const result = await send(from, text, { replyToMessageId: message.id });
    return { sent: Boolean(result?.ok), reason: result?.ok ? 'sent' : 'delivery_failed' };
  };
  if (!['text', 'location'].includes(message?.type)) {
    return deliver(message?.type === 'document'
      ? 'O recebimento de PDF pelo WhatsApp ainda não está disponível. Importe sua escala pelo CrewCheck; depois consulte “escala” ou “diárias” aqui.'
      : message?.type === 'interactive' || message?.type === 'button'
      ? 'Esse botão não está disponível neste menu. Digite “menu” ou sua pergunta por aqui.'
      : 'Por aqui, envie texto ou localização. Digite “menu” para ver as consultas disponíveis.');
  }
  const text = String(message.text || '').trim().slice(0, 4000);
  if (message.type === 'text' && !text) return { sent: false, reason: 'empty_text' };
  if (message.type === 'text' && menuRequest(text)) return deliver(WHATSAPP_MENU);
  if (typeof handler !== 'function') return deliver('Não consegui carregar sua consulta agora. Tente novamente por aqui em instantes.');
  let result;
  try {
    result = await handler({
      email: String(link.email), text: commands.get(normalize(text)) || text,
      location: message.location || null, messageType: message.type, messageId: message.id,
    });
  } catch {
    return deliver('Não consegui concluir essa consulta agora. Tente novamente por aqui em instantes.');
  }
  const reply = typeof result === 'string' ? result : String(result?.text || result?.reply || '');
  return deliver(reply.trim() || 'Não há informação confirmada para essa consulta agora. Você pode fazer outra pergunta por aqui.');
}
