// Text-only capability map. No transport, account lookup, tools or persistence.
const APP = 'https://crewcheck.online/';
export const WHATSAPP_TEXT_MENU = [
  '✈️ *CrewCierge · BETA*',
  'Escreva sua pergunta ou o número da opção.',
  '',
  '📅 *ESCALA SALVA · 1–5*',
  '1. Programação de hoje',
  '2. Programação de amanhã',
  '3. Próxima programação',
  '4. Resumo da escala',
  '5. Apresentação no aeroporto',
  '',
  '🏨 *PERNOITE E TRANSPORTE · 6–8*',
  '6. Histórico de pernoites (não é o hotel atual)',
  '7. Hotel e quarto (no app)',
  '8. Saída Inteligente (no app)',
  '',
  '📡 *VOOS, TEMPO E SERVIÇOS · 9–14*',
  '9. Como consultar Radar e portão',
  '10. Como consultar METAR',
  '11. Como consultar TAF',
  '12. Academias / Wellhub',
  '13. Farmácias',
  '14. Hospitais',
  '',
  '📱 *CONTINUE NO APP · 15–17*',
  '15. Diárias e financeiro (no app)',
  '16. Regulamentação (no app)',
  '17. Preferências e canais (no app)',
  '',
  '💬 Exemplos: “o que tenho amanhã?”, “que horas a van me pega no hotel?”, “METAR SBGR”.',
  '',
  '🔒 *ACESSO BETA* · WhatsApp restrito ao piloto autorizado. Respostas dependem dos dados disponíveis; avisarei quando faltar informação.',
  'Telegram: alternativa gratuita de mensagens, conforme acesso e dados da conta. Vincule no app em Concierge → WhatsApp e Telegram.',
  'Para rever as opções, escreva “menu”.',
].join('\n');
const replies = {
  '7': `Informe ou revise hotel/quarto no app, em Menu → Hotéis. Selecione a estadia correta antes de salvar: ${APP}?view=hotels`,
  '8': `Abra Saída Inteligente no app e revise a programação, origem, destino e referência de rota. Apresentação no aeroporto, apresentação no hotel e busca da van são horários distintos; a rota não confirma a busca da van: ${APP}`,
  '9': 'Informe o voo e a data. Exemplo: “qual o portão do LA1234 em 25/10?”. Sem fonte atual confirmada, portão e status ficam indisponíveis.',
  '10': 'Informe o aeroporto: “METAR SBGR” ou /metar SBGR. A resposta depende da fonte disponível e deve indicar observação/atualização; dados antigos não confirmam a situação ao vivo.',
  '11': 'Informe o aeroporto: /taf SBGR. A previsão depende da fonte disponível; confira emissão e validade, que não equivalem a uma observação atual.',
  '15': `Diárias e financeiro ficam no app. Não calculo valores nem confirmo pagamento a partir da conversa: ${APP}?view=perdiem`,
  '16': `Abra Regulamentação no app para revisar as evidências e pendências. Este menu não confirma limite, irregularidade, repouso realizado ou autorização operacional: ${APP}`,
  '17': `Abra Menu → Configurações ou Concierge → WhatsApp e Telegram no app. Vínculo e consentimento não ativam entrega automaticamente: ${APP}`,
};
const commands = { '1': '/hoje', '2': '/amanha', '3': '/proximo', '4': '/escala', '5': 'que horas me apresento?', '6': '/historico_pernoites', '12': '/academias', '13': '/farmacias', '14': '/hospitais' };
export function whatsappTextMenu(text, profile = {}) {
  if (profile.channel !== 'whatsapp' || profile.linked !== true || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(profile.email || '')) return null;
  if (typeof text !== 'string' || text.length > 600) return null;
  const value = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  if (/^(?:\/(?:start|ajuda|help|comandos|menu)|oi|ola|bom dia|boa tarde|boa noite|menu|ajuda|comandos|inicio)[!.?]*$/.test(value)) return { reply: WHATSAPP_TEXT_MENU };
  const option = value.match(/^(?:opcao\s+)?(\d{1,2})[.)]?$/)?.[1];
  if (!option) return null;
  if (replies[option]) return { reply: replies[option] };
  if (commands[option]) return { text: commands[option] };
  return { reply: 'Essa opção não está no menu. Escreva “menu” para ver todas as opções, ou faça sua pergunta.' };
}
