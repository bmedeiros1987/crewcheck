const injection = /ignore\s+(?:(?:all|as|todas|previous|prior|anteriores)\s+)*(?:instructions|instru[çc][õo]es)|(?:system|developer)\s*(?:prompt|message)|<\/?(?:system|assistant|tool)>|\b(?:execute|exfiltrate)\b/i;
export const containsConversationInstruction = value => typeof value === "string" && injection.test(value);

const clarification = 'Você quer a apresentação no aeroporto, a APZ do hotel ou a saída da van? São horários diferentes. Hotel e van dependem de uma fonte autorizada, ainda indisponível neste piloto.';
export function classifyConversation(text) {
  if (typeof text !== 'string' || text.length > 500 || containsConversationInstruction(text)) return { kind: 'unsupported' };
  const value = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[?!.]+$/, '').trim()
    .replace(/\b(?:proxma|proximaa|prx|prox)\b/g, 'proxima').replace(/\bjoranda\b/g, 'jornada').replace(/\bescalla\b/g, 'escala');
  if (/\b(?:financeiro|diarias|salario|receber|radar|metar|conformidade|legal|amanha|hoje|ontem|depois|conta|email|usuario)\b/.test(value)) return { kind: 'unsupported' };
  if (/\b(?:hotel|van|pickup|apz|apresentacao)\b/.test(value)) {
    if (!/\baeroporto\b/.test(value) || /\b(?:hotel|van|pickup)\b/.test(value)) return { kind: 'clarify', reply: clarification };
    if (/^(?:e |e a |e o )/.test(value)) return { kind: 'continuation' };
    if (/\b(?:proxima|proximo|seguinte)\b/.test(value)) return { kind: 'read', intent: 'nextDuty.read' };
    return { kind: 'clarify', reply: 'Qual programação você quer consultar? Informe se é a próxima jornada. Apresentação no aeroporto não é APZ do hotel nem saída da van.' };
  }
  if (/^(?:e (?:o horario|a jornada|essa programacao))$/.test(value)) return { kind: 'continuation' };
  if (value === '/proximo' || (/\b(?:proxima|proximo|seguinte)\b/.test(value) && /\b(?:jornada|escala|programacao)\b/.test(value))) return { kind: 'read', intent: 'nextDuty.read' };
  if (value === '/escala' || (/\bescala\b/.test(value) && /\b(?:minha|ver|mostra|mostre|resumo|resume)\b/.test(value))) return { kind: 'read', intent: 'schedule.read' };
  return { kind: 'unsupported' };
}
export function conversationIntent(text) {
  return classifyConversation(text).intent || null;
}
