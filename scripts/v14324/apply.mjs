import fs from 'node:fs';

function patchFile(filePath, transform) {
  if (!fs.existsSync(filePath)) throw new Error(`[v14.3.24] Arquivo ausente: ${filePath}`);
  const before = fs.readFileSync(filePath, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(filePath, after, 'utf8');
}

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) throw new Error(`[v14.3.24] Ponto não encontrado: ${label}`);
  return source.replace(search, replacement);
}

patchFile('server.mjs', (initial) => {
  let source = initial;

  const hospitalStart = `async function conciergeHospitalsReply(snapshot) {`;
  const hospitalEnd = `function conciergeStayReply(snapshot) {`;
  const startIndex = source.indexOf(hospitalStart);
  const endIndex = source.indexOf(hospitalEnd, startIndex);
  if (startIndex < 0 || endIndex < 0) throw new Error('[v14.3.24] Bloco hospitalar não encontrado.');
  const hospitalReplacement = `async function conciergeHospitalsReply(snapshot) {
  const preferences = snapshot?.preferences || {};
  const plan = String(preferences.healthPlan || preferences.medicalPlan || preferences.healthInsurance || preferences.planoSaude || '').trim();
  const network = String(preferences.healthNetwork || preferences.medicalNetwork || preferences.redeCredenciada || '').trim();
  const location = preferences.location;
  const stay = conciergeCurrentStay(snapshot?.roster);
  const next = conciergeNextProgram(snapshot?.roster);
  const hotel = stay?.hotel || (snapshot?.roster?.days || []).find((day) => day?.hotel)?.hotel || '';
  const airport = stay?.location || next?.legs?.[0]?.origin || snapshot?.roster?.base || '';
  if (!plan && !network) {
    return 'Para buscar atendimento compatível, primeiro informe seu plano de saúde e, quando houver, a rede ou categoria do plano no perfil. Assim eu evito misturar hospitais particulares que podem não atender seu convênio.';
  }
  const planLabel = [plan, network].filter(Boolean).join(' · ');
  const query = `${planLabel} hospital pronto atendimento emergência 24 horas credenciado`;
  const places = await conciergeSearchPlaces(query, hotel || `${airport} ${WEATHER_AIRPORT_POINTS[airport]?.city || ''}`, location, 7);
  if (!places.length) return `Não encontrei unidades para ${planLabel} pelo serviço de locais agora. Consulte o aplicativo, a carteirinha ou a central oficial do plano antes de se deslocar.`;
  return [
    `Possíveis unidades para ${planLabel}`,
    '',
    conciergePlaceLines(places),
    '',
    'A busca usa o nome do plano para priorizar resultados, mas não confirma credenciamento. Confirme cobertura, rede, especialidade, carência e atendimento diretamente com o plano e a unidade.',
    'As distâncias são aproximadas em linha reta. Em emergência, procure o serviço oficial mais adequado imediatamente.',
  ].join('\\n');
}

${hospitalEnd}`;
  source = source.slice(0, startIndex) + hospitalReplacement + source.slice(endIndex + hospitalEnd.length);

  const complianceStart = `function conciergeComplianceReply(snapshot) {`;
  const complianceEnd = `function conciergeScheduleReply(snapshot, mode = 'next') {`;
  const cs = source.indexOf(complianceStart);
  const ce = source.indexOf(complianceEnd, cs);
  if (cs < 0 || ce < 0) throw new Error('[v14.3.24] Bloco de conformidade não encontrado.');
  const complianceReplacement = `function conciergeComplianceReply(snapshot, question = '') {
  const records = conciergeProgramRecords(snapshot?.roster);
  if (!records.length) return 'Ainda não tenho uma escala ativa para fazer uma leitura preventiva da regulamentação.';
  const next = conciergeNextProgram(snapshot?.roster);
  const longDuty = records.filter((record) => Number(record.day?.dutyHours || 0) >= 11);
  const shortRest = records.slice(1).filter((record, index) => (record.start.getTime() - records[index].end.getTime()) / 3_600_000 < 12);
  const lines = [
    'Leitura simples de regulamentação',
    'RBAC 117 reúne regras de jornada, repouso, madrugadas e limites operacionais. O acordo coletivo ou regra da empresa pode ser mais restritivo.',
  ];
  if (next) lines.push(`Próxima atividade: ${conciergeProgramTitle(next)} · apresentação ${conciergePresentationTime(next)}.`);
  if (longDuty.length) lines.push(`Encontrei ${longDuty.length} jornada(s) publicada(s) com duração elevada para revisão.`);
  if (shortRest.length) lines.push(`Encontrei ${shortRest.length} intervalo(s) inferior(es) a 12 horas entre atividades para conferência.`);
  if (!longDuty.length && !shortRest.length) lines.push('Pelos dados disponíveis, não apareceu um alerta simples de jornada longa ou intervalo curto. Isso não confirma regularidade completa.');
  if (/até que horas|limite|posso voar|finalizar|encerrar/i.test(question)) lines.push('Para calcular até que horas você pode finalizar, eu preciso considerar função, hora aclimatada de início, número de etapas, Reserva ou Sobreaviso e a regra mais restritiva aplicável.');
  lines.push('Use esta resposta como apoio. Confirme a escala, o ACT/CCT aplicável e os canais oficiais antes de tomar decisão operacional ou jurídica.');
  return lines.join('\\n');
}

function conciergeTargetDateFromText(text = '', now = new Date()) {
  const lower = String(text || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
  const base = new Date(now);
  const make = (offset) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset, 12, 0, 0);
  if (/\\bhoje\\b/.test(lower)) return make(0);
  if (/\\bamanha\\b/.test(lower)) return make(1);
  if (/\\bdepois de amanha\\b/.test(lower)) return make(2);
  const weekdayMap = { domingo:0, segunda:1, terca:2, quarta:3, quinta:4, sexta:5, sabado:6 };
  for (const [name, weekday] of Object.entries(weekdayMap)) {
    if (new RegExp(`\\\\b${name}(?:-feira)?\\\\b`).test(lower)) {
      let offset = (weekday - base.getDay() + 7) % 7;
      if (offset === 0 && !/hoje/.test(lower)) offset = 7;
      return make(offset);
    }
  }
  const dayMonth = lower.match(/(?:dia\\s*)?(\\d{1,2})(?:[\\/\\-](\\d{1,2}))?/);
  if (dayMonth) {
    const day = Number(dayMonth[1]);
    const month = dayMonth[2] ? Number(dayMonth[2]) - 1 : base.getMonth();
    let year = base.getFullYear();
    let target = new Date(year, month, day, 12, 0, 0);
    if (!dayMonth[2] && target < make(0)) target = new Date(year, month + 1, day, 12, 0, 0);
    return target;
  }
  return null;
}

function conciergeScheduleForDate(snapshot, target) {
  const roster = snapshot?.roster;
  if (!roster?.days?.length || !target) return 'Ainda não tenho uma escala ativa ou não consegui identificar a data.';
  const key = conciergeDateKey(target);
  const programs = conciergeProgramRecords(roster).filter((record) => conciergeRecordDateKey(record) === key);
  const stays = conciergeStayRecords(roster).filter((record) => conciergeDateKey(record.start) === key || conciergeDateKey(record.end) === key);
  const label = new Intl.DateTimeFormat('pt-BR', { weekday:'long', day:'2-digit', month:'long', timeZone:'America/Sao_Paulo' }).format(target);
  if (!programs.length && !stays.length) return `${label}: nenhuma atividade ou pernoite publicado na escala ativa.`;
  const parts = [label];
  if (programs.length) parts.push('', ...programs.map((record) => conciergeFormatProgram(record)));
  if (stays.length) parts.push('', ...stays.map((stay) => `Pernoite${stay.hotel ? ` · ${stay.hotel}` : ''}${stay.location ? ` · ${stay.location}` : ''}`));
  return parts.join('\\n\\n');
}

function conciergeAlertsReply(snapshot) {
  const roster = snapshot?.roster || {};
  const next = conciergeNextProgram(roster);
  const lines = ['Seus alertas atuais'];
  if (!next) return 'Não encontrei uma próxima atividade para montar alertas agora. Sincronize a escala e tente novamente.';
  lines.push(`• Próxima atividade: ${conciergeProgramTitle(next)} · apresentação ${conciergePresentationTime(next)}.`);
  const reminder = conciergeOperationalReminder(next, roster);
  if (reminder) lines.push(reminder.replace(/^\\n+/, ''));
  const hours = conciergeHoursUntil(next.start, new Date());
  if (hours <= 6) lines.push('• Janela curta para a próxima apresentação: priorize descanso e preparação.');
  if (conciergeCurrentStay(roster)) lines.push('• Você está em contexto de pernoite ou descanso fora da base.');
  lines.push('Alertas de portão, voo e meteorologia dependem de dados atualizados. Confirme sempre nos canais oficiais.');
  return lines.join('\\n');
}

${complianceEnd}`;
  source = source.slice(0, cs) + complianceReplacement + source.slice(ce + complianceEnd.length);

  source = source.replace(
    `  if (/^\\/(?:hoje)(?:@\\S+)?\\b/i.test(value) || /\\b(programa[cç][aã]o|escala)\\s+(de\\s+)?hoje\\b/i.test(lower)) return conciergeScheduleReply(snapshot, 'today');`,
    `  const requestedDate = conciergeTargetDateFromText(value);\n  if (requestedDate && /(?:o que|oq|qual|escala|programa[cç][aã]o|tenho|trabalho|voo|atividade|pernoite|folga)/i.test(lower)) return conciergeScheduleForDate(snapshot, requestedDate);\n  if (/^\\/(?:hoje)(?:@\\S+)?\\b/i.test(value) || /\\b(programa[cç][aã]o|escala)\\s+(de\\s+)?hoje\\b/i.test(lower)) return conciergeScheduleReply(snapshot, 'today');`,
  );
  source = source.replace(
    `  if (/^\\/conformidade(?:@\\S+)?\\b/i.test(value) || /\\b(rbac|act|irregularidade|conformidade)\\b/i.test(lower)) return conciergeComplianceReply(snapshot);`,
    `  if (/^\\/conformidade(?:@\\S+)?\\b/i.test(value) || /\\b(rbac|regulamenta[cç][aã]o|act|cct|jornada|repouso|irregularidade|conformidade|limite de jornada|até que horas)\\b/i.test(lower)) return conciergeComplianceReply(snapshot, value);`,
  );
  const alertAnchor = `  if (/^\\/(?:alertameteo|alertasmeteo)(?:@\\S+)?\\b/i.test(value)) return conciergeWeatherAlertsReply(value, profile, snapshot);`;
  const alertReplacement = `${alertAnchor}\n  if (/^\\/(?:alertas|avisos)(?:@\\S+)?\\b/i.test(value) || /\\b(quais alertas|meus alertas|tem algum alerta|algum aviso|o que preciso lembrar)\\b/i.test(lower)) return conciergeAlertsReply(snapshot);`;
  source = replaceOnce(source, alertAnchor, alertReplacement, 'alertas gerais');
  return source;
});

console.log('[v14.3.24] Concierge ampliado: rede do plano, datas naturais, alertas e RBAC em linguagem clara.');
