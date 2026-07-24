import fs from 'node:fs';

function patchFile(filePath, transform) {
  if (!fs.existsSync(filePath)) throw new Error(`[v14.3.22] Arquivo ausente: ${filePath}`);
  const before = fs.readFileSync(filePath, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(filePath, after, 'utf8');
}

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) throw new Error(`[v14.3.22] Ponto de aplicação não encontrado: ${label}`);
  return source.replace(search, replacement);
}

patchFile('client/src/lib/calendarExport.ts', (initial) => {
  let source = initial;
  const helperAnchor = `function addDisplayMinutes(time: string, minutesToAdd: number): string {`;
  const helpers = `function rosterDayCode(day?: RosterDay): string {
  return String(day?.pairingCode || day?.type || '').trim().toUpperCase();
}

function isPublishedRestOrOff(day?: RosterDay): boolean {
  const code = rosterDayCode(day);
  return !day || /^(DO|DOF|DOP|OFF|FOLGA|REST)$/.test(code) || isRestDay(day);
}

function shouldVerifyScaleAfterProgram(roster: CrewRoster, day: RosterDay, dayIndex: number): boolean {
  const hasOperationalProgram = Boolean(day.legs?.length || (day.dutyReport && day.dutyDebrief && !isRestDay(day)));
  if (!hasOperationalProgram) return false;
  return isPublishedRestOrOff(roster.days?.[dayIndex + 1]);
}

function buildScaleVerificationDescription(roster: CrewRoster, day: RosterDay): string {
  return [
    '⚠️ CrewCheck · encerramento da programação',
    '',
    'Verifique sua escala oficial após a última atividade do dia.',
    '',
    'Confirme alterações, programação futura, apresentação, Reserva, Sobreaviso, folga e comunicados publicados.',
    'O calendário e o CrewCheck são ferramentas de apoio e não substituem a escala oficial nem os canais da empresa.',
    '',
    \`Tripulante: \${titleCase(roster.crewName)}\`,
    \`Data: \${day.date}\`,
    day.legs?.length ? \`Última rota: \${pairingRoute(day)}\` : \`Atividade: \${day.pairingCode || day.type || 'Programação'}\`,
    '',
    '#CREWCHECK #VERIFICAR_ESCALA',
  ].filter(Boolean).join('\\n');
}

${helperAnchor}`;
  source = replaceOnce(source, helperAnchor, helpers, 'helpers de verificação da escala');

  const flightClose = `      }
    }

    if (shouldExportDuties(cfg.mode)`;
  const flightReminder = `      }

      if (shouldVerifyScaleAfterProgram(roster, day, dayIndex)) {
        const verificationStart = pairingEndTime(day);
        const verificationNextDay = pairingArrivesNextDay(day);
        ical += buildEvent({
          uid: \`\${uidBase}-verify-scale-flight-\${dayIndex}\`,
          now,
          start: formatDateTimeForIcal(day.date, verificationStart, verificationNextDay ? 1 : 0),
          end: formatDateTimeForIcal(day.date, addDisplayMinutes(verificationStart, 15), verificationNextDay ? 1 : 0),
          summary: 'Verificar escala oficial',
          description: buildScaleVerificationDescription(roster, day),
          location: 'Escala oficial · canal da empresa',
          categories: 'CrewCheck,RosterVerification,Safety',
          transparency: 'TRANSPARENT',
          alarms: cfg.includeReminders ? [15, 0] : [],
          color: '#ef4444',
        });
      }
    }

    if (shouldExportDuties(cfg.mode)`;
  source = replaceOnce(source, flightClose, flightReminder, 'lembrete após voo');

  const dutyClose = `      }
    }

    if (shouldExportRest(cfg.mode)`;
  const dutyReminder = `      }

      if (shouldVerifyScaleAfterProgram(roster, day, dayIndex)) {
        ical += buildEvent({
          uid: \`\${uidBase}-verify-scale-duty-\${dayIndex}\`,
          now,
          start: formatDateTimeForIcal(day.date, day.dutyDebrief, endNextDay ? 1 : 0),
          end: formatDateTimeForIcal(day.date, addDisplayMinutes(day.dutyDebrief, 15), endNextDay ? 1 : 0),
          summary: 'Verificar escala oficial',
          description: buildScaleVerificationDescription(roster, day),
          location: 'Escala oficial · canal da empresa',
          categories: 'CrewCheck,RosterVerification,Safety',
          transparency: 'TRANSPARENT',
          alarms: cfg.includeReminders ? [15, 0] : [],
          color: '#ef4444',
        });
      }
    }

    if (shouldExportRest(cfg.mode)`;
  source = replaceOnce(source, dutyClose, dutyReminder, 'lembrete após atividade sem pernas');
  return source;
});

patchFile('server.mjs', (initial) => {
  let source = initial;
  const scheduleAnchor = `function conciergeScheduleReply(snapshot, mode = 'next') {`;
  const helper = `function conciergeOperationalReminder(record, roster = {}) {
  if (!record) return '';
  const base = String(roster.base || record.day?.base || '').trim().toUpperCase();
  const code = String(record.code || record.day?.pairingCode || record.day?.type || '').trim().toUpperCase();
  const firstOrigin = String(record.legs?.[0]?.origin || '').trim().toUpperCase();
  const hasPositioning = record.legs?.some((leg) => String(leg?.workType || '').toUpperCase() === 'PS') || /^(PS|EXTRA)$/.test(code);
  const isReserve = /^(ASB|RES|RESERVA)$/.test(code);
  const needsPresentationForm = isReserve || Boolean(base && firstOrigin === base && hasPositioning);
  const days = Array.isArray(roster.days) ? roster.days : [];
  const index = days.indexOf(record.day);
  const next = index >= 0 ? days[index + 1] : null;
  const nextCode = String(next?.pairingCode || next?.type || '').trim().toUpperCase();
  const nextIsOff = !next || /^(DO|DOF|DOP|OFF|FOLGA|REST)$/.test(nextCode);
  const reminders = [];
  if (needsPresentationForm) reminders.push('Preencha o formulário de apresentação da escala e confirme o procedimento no canal oficial da empresa.');
  if (nextIsOff) reminders.push('Ao terminar a última atividade, verifique novamente a escala oficial para confirmar alterações e a próxima programação.');
  if (!reminders.length) return '';
  return ['', 'Atenção operacional', ...reminders.map((item) => \`• \${item}\`), 'O CrewCheck é uma ferramenta de apoio e não substitui a escala oficial.'].join('\\n');
}

${scheduleAnchor}`;
  source = replaceOnce(source, scheduleAnchor, helper, 'helper do Concierge');
  const nextReturn = `  return next ? \`Próxima programação\\n\\n\${conciergeFormatProgram(next)}\` : 'Nenhuma programação futura detectada na escala ativa.';`;
  const nextReturnPatched = `  return next ? \`Próxima programação\\n\\n\${conciergeFormatProgram(next)}\${conciergeOperationalReminder(next, roster)}\` : 'Nenhuma programação futura detectada na escala ativa.';`;
  source = replaceOnce(source, nextReturn, nextReturnPatched, 'resposta da próxima programação');
  return source;
});

console.log('[v14.3.22] Formulário de apresentação e verificação final da escala aplicados ao calendário e ao Concierge.');
