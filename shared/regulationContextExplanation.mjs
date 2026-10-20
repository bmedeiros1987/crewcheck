// Presentation only. References and projections come from the existing engines;
// this reader never selects a legal rule or authorizes an operation.
const clock = value => typeof value === 'string' && /^(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*\(\+\d+\))?$/.test(value) ? value : 'não informado';
const local = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? value.replace('T', ' · ') : 'não informado';
const duration = value => Number.isSafeInteger(value) && value > 0 ? `${Math.floor(value / 60)}h${String(value % 60).padStart(2, '0')}` : null;

export function regulationContextExplanation({ allowed = false, scheduleDay = null, program = null, reference = null, form = {}, result = null } = {}) {
  if (!allowed) return null;
  const journey = Array.isArray(scheduleDay?.regulationJourney) ? scheduleDay.regulationJourney : [];
  const scoped = program?.journeyId && journey.length && journey.every(event => event?.journeyId === program.journeyId) && journey.some(event => event?.id === program.id);
  // A retained draft/reference can still belong to the previous selection.
  // With an incompatible source sequence, none of its derived text is safe to
  // narrate. A genuinely manual scenario (no sequence) remains available below.
  if (journey.length && !scoped) return {
    facts: [], hypothesis: '', scenario: '', next: null,
    pending: [{ label: 'A sequência recebida não corresponde à programação selecionada. Selecione novamente ou recarregue a programação para explicar esta jornada.', field: '' }],
  };
  const legs = scoped ? journey.map(event => event.leg || {}) : [];
  const facts = [];
  if (scoped) {
    facts.push(`Jornada selecionada: ${scheduleDay.date || 'data não informada'} · ${legs.length} trecho(s) publicado(s). A análise considera a sequência completa, não só o próximo voo.`);
    facts.push(`Apresentação: ${clock(scheduleDay.dutyReport)} · ${scheduleDay.dutyReportSource === 'published' ? 'publicada' : scheduleDay.dutyReportSource === 'estimated' ? 'estimada; confirme o horário' : 'origem não comprovada'}. Partida não substitui apresentação.`);
    for (const leg of legs) {
      const type = String(leg.workType || '').toUpperCase();
      facts.push(`${leg.flightNumber || 'Voo sem número'} · ${leg.origin || 'origem pendente'} → ${leg.destination || 'destino pendente'} · ${clock(leg.departureTime)} → ${clock(leg.arrivalTime)}${type === 'PS' ? ' · PS: deslocamento publicado; não equivale a voo operado pelo tripulante' : type === 'OP' ? ' · OP publicado' : ' · classificação operacional a confirmar'}.`);
    }
  } else facts.push('Sem sequência canônica confirmada para esta seleção. Os campos manuais abaixo permitem explicar uma hipótese sem atribuí-la à escala.');
  facts.push(`Encerramento usado: ${local(form.plannedEnd)}${form.plannedEndSource ? ' · ' + form.plannedEndSource : ''}. Solo entre trechos permanece dentro da jornada; chegada não comprova liberação nem realização.`);
  const referenceDuration = duration(reference?.maxDutyMinutes);
  const hypothesis = scoped && referenceDuration
    ? `Referência condicional do motor existente: ${referenceDuration}, a partir de ${clock(reference.startTime)}, para ${reference.sectors} etapa(s). ${reference.source || ''}. Hipótese B.1 de tripulação simples e aclimatada; confirme composição, aclimatação e fuso antes de adotá-la. Não é limite operacional confirmado.`
    : 'Referência aplicável ainda não disponível. A apresentação e o contexto precisam ser confirmados; nenhum limite foi inventado para preencher a lacuna.';
  const delay = /^\d+$/.test(String(form.delay)) && Number(form.delay) <= 1440 ? Number(form.delay) : null;
  const scenario = `${form.method === 'detailed' ? 'No método detalhado, o atraso desloca a decolagem estimada do trecho; voo, táxi, pós-voo e tarefas precisam ser informados separadamente.' : `Na jornada programada, ${delay === null ? 'um atraso informado' : `o atraso editável de ${delay} min`} desloca o encerramento; não reinicia a apresentação.`} O limite normal informado nesta tela (${local(form.normalEnd)}) é de encerramento/liberação da jornada, não de pouso ou corte. Chegada programada não comprova parada dos motores; não derive o corte subtraindo pós-voo da chegada. ${form.extension ? 'A hipótese de +60 min altera somente a referência temporal da simulação, sem aumentar o tempo de voo permitido.' : 'A opção de +1 hora é uma hipótese separada; não está aplicada.'} Isso não autoriza extensão: ACT/regime aplicável, condições, decisão competente, repouso e acumulados continuam sujeitos à avaliação aplicável.`;
  const pending = [];
  if (!scoped) pending.push({ label: 'Selecione uma programação na escala para carregar sua sequência.', field: '' });
  if (form.composition !== 'simple') pending.push({ label: form.composition ? 'A composição informada exige referência própria revisada; não use automaticamente B.1 simples.' : 'Confirme a composição da tripulação.', field: 'Composição da tripulação' });
  if (form.acclimatization !== 'acclimatized') pending.push({ label: form.acclimatization === 'not_acclimatized' ? 'A condição não aclimatada exige referência aplicável revisada.' : 'Confirme sua condição de aclimatação.', field: 'Condição de aclimatação' });
  if (!form.publicationOffsetReviewed) pending.push({ label: 'Confirme o fuso dos horários publicados.', field: 'Confirmei o fuso dos horários publicados' });
  for (const missing of result?.missing || []) pending.push({ label: missing, field: missing === 'Encerramento programado ou estimado da jornada' ? 'Encerramento programado da jornada' : missing === 'Limite normal da jornada' || missing === 'Limite normal revisado' ? 'Limite normal de encerramento' : '' });
  return { facts, hypothesis, scenario, pending, next: pending.find(item => item.field) || null };
}
