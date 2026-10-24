// Text-only capability map. No transport, account lookup, tools or persistence.
const APP = 'https://crewcheck.online/';
export const WHATSAPP_TEXT_MENU = [
  'CrewCierge · menu completo',
  'Escreva sua pergunta ou o número. Não é preciso decorar comandos.',
  '',
  'ESCALA SALVA',
  '1. Programação de hoje',
  '2. Programação de amanhã',
  '3. Próxima programação',
  '4. Resumo da escala',
  '5. Apresentação no aeroporto',
  'Exemplos: “qual minha próxima jornada?”, “o que tenho amanhã?”, “q hrs me apresento?”',
  '',
  'PERNOITE E TRANSPORTE',
  '6. Histórico de pernoites salvos (não confirma a estadia atual)',
  '7. Informar hotel ou quarto no app',
  '8. Saída Inteligente no app',
  'Exemplos: “em que hotel vou ficar?”, “q hrs a van me pega?”',
  'APZ no aeroporto, APZ do hotel e saída da van são horários distintos. Sem fonte confirmada, hotel, pickup, contato e prazo de espera ficam indisponíveis.',
  '',
  'CONSULTAS QUE DEPENDEM DE FONTE E CONEXÃO',
  '9. Como consultar Radar/portão de um voo',
  '10. Como consultar METAR',
  '11. Como consultar TAF',
  '12. Academias / Wellhub',
  '13. Farmácias',
  '14. Hospitais',
  'Exemplos: “portão do LA1234?”, “METAR SBGR”, “farmácias perto de mim”. Sem voo, local ou fonte disponível, pedirei o dado ou informarei a indisponibilidade. Não confirmo dados ao vivo a partir do cache.',
  '',
  'NO APP',
  '15. Diárias e financeiro',
  '16. Regulamentação e revisão da escala',
  '17. Configurações, vínculos e consentimentos',
  'Valores financeiros, conformidade e envio automático não são confirmados por este menu.',
  '',
  'Dados ausentes não viram zero ou horários inventados. A resposta usa as fontes disponíveis no CrewCheck; horário/fuso e atualização devem ser conferidos na fonte. WhatsApp precisa de conexão; consultas locais offline no app têm cobertura própria.',
  'Alternativa gratuita de mensagens: CrewCierge no Telegram. Vincule em Concierge → WhatsApp e Telegram no app; recursos dependem dos dados e do acesso da sua conta.',
  'WhatsApp permanece restrito ao piloto autorizado. Este menu não libera novos envios.',
  'Não faço ligações, reservas ou novos envios por mostrar este menu. Para revê-lo, escreva “menu”.',
].join('\n');
const replies = {
  '7': `Informe ou revise hotel/quarto no app, em Menu → Hotéis. Selecione a estadia correta antes de salvar: ${APP}?view=hotels`,
  '8': `Abra Saída Inteligente no app e revise a programação, origem, destino e referência de rota. Isso não confirma pickup da van: ${APP}`,
  '9': 'Informe o voo e a data. Exemplo: “qual o portão do LA1234 em 25/10?”. Sem fonte atual confirmada, portão e status ficam indisponíveis.',
  '10': 'Informe o aeroporto: “METAR SBGR” ou /metar SBGR. A resposta depende da fonte disponível e deve indicar observação/atualização; cache não é ao vivo.',
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
