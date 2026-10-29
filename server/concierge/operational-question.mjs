// Bounded lexical aliases only. No model, storage, clock selection or data lookup.
export function operationalQuestion(text = '') {
  if (typeof text !== 'string' || text.length > 600 || /^\s*\//.test(text)) return null;
  const value = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\b(?:q|ql)\b/g, word => word === 'q' ? 'que' : 'qual')
    .replace(/\b(?:hrs|hr)\b/g, 'horas').replace(/\bapresntacao\b/g, 'apresentacao')
    .replace(/\bproximaa\b/g, 'proxima').replace(/\s+/g, ' ').trim();
  if (/\b(?:salve|salvar|cadastre|cadastrar|apague|apagar|exclua|excluir|envie|enviar|mande|reservar|compre|vincular|ignore|instrucoes|system|prompt|salario|saldo|senha|token)\b/.test(value)) return null;
  const hotel = /\b(?:hotel|hoteis|pernoite|hospedagem)\b/.test(value);
  const van = /\b(?:van|pickup|transfer|traslado)\b/.test(value);
  const apz = /\bapz\b/.test(value);
  const clock = /\b(?:horas|horario|hora|quando|apz|apresentacao|apresento)\b/.test(value);
  if (hotel && !van && !apz && /\b(?:academias?|farmacias?|hospital|hospitais|wellhub)\b/.test(value)) return null;
  const question = apz || /\b(?:que|qual|quando|onde|como|ate|quero|preciso|saber|me|minha|meu)\b/.test(value);
  if (apz && /\baeroporto\b/.test(value) && !hotel && !van) return { kind: 'schedule', intent: 'presentation', rewrite: '' };
  if (apz && (van || !hotel || /\baeroporto\b/.test(value))) return { kind: 'logistics-question', subject: 'apz', direction: null };
  if (van && question) {
    let direction = /\baeroporto (?:para|pro|ao) (?:o )?hotel\b/.test(value) ? 'airport-hotel'
      : /\bhotel (?:para|pro|ao) (?:o )?aeroporto\b/.test(value) ? 'hotel-airport' : null;
    if (/\baeroporto (?:para|pro|ao) (?:o )?hotel\b/.test(value) && /\bhotel (?:para|pro|ao) (?:o )?aeroporto\b/.test(value)) direction = null;
    const subject = /\b(?:contato|telefone|whatsapp|numero)\b/.test(value) ? 'contact'
      : /\b(?:esperar|espera|aguardar|aguardo)\b/.test(value) ? 'wait'
      : clock || /\b(?:busca|buscar|pega|pegar|sai|saida)\b/.test(value) ? 'pickup' : null;
    if (subject) {
      // A hotel pickup supplies an origin, not an airport destination.
      const hotelOrigin = subject === 'pickup' && direction === null
        && /^(?:que (?:hora|horas)|quando) (?:a )?van (?:me (?:pega|busca) (?:no|do) hotel|sai do hotel)$/.test(value);
      return { kind: 'logistics-question', subject, direction, ...(hotelOrigin ? { origin: 'hotel' } : {}) };
    }
  }
  if (hotel && question && clock) return { kind: 'logistics-question', subject: 'hotel-time', direction: null };
  if (hotel && /\b(?:qual|onde|que hotel|em que hotel)\b/.test(value)
      && !/\b(?:academias?|farmacias?|hospital|hospitais|perto|proximo|sugestao|buscar|pesquisar)\b/.test(value)) {
    return { kind: 'logistics-question', subject: 'hotel', direction: null };
  }
  if (!hotel && !van && /\b(?:que horas|qual horario|quando)\b.*\b(?:apresento|apresentacao|report)\b/.test(value)) return { kind: 'schedule', intent: 'presentation', rewrite: '' };
  if (!hotel && !van && /\b(?:proxima|proximo|prox)\b/.test(value)
      && /\b(?:jornada|programacao|atividade|servico|voo|escala)\b/.test(value)) return { kind: 'schedule', intent: 'next', rewrite: '/proximo' };
  if (/^(?:como (?:ta|esta) (?:a |minha )?escala|(?:me )?(?:mostra|mostre|resuma) (?:a |minha )?escala)$/.test(value)) return { kind: 'schedule', intent: 'summary', rewrite: '/escala' };
  return null;
}
