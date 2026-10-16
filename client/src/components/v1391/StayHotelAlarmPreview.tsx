import { calculateStayWakeup, stayLocalInstant, type StayAlarmChoice } from '@shared/stay-edit-plan.mjs';

type Props = {
  eventId: string;
  hotelApzIso: string;
  timeZone: string;
  choice: StayAlarmChoice | undefined;
  defaultLeadMinutes: number | undefined;
  nativeTestReady?: boolean;
  onProgram?: (alarmAt: string, hotelReportAt: string) => void;
  onChoice: (choice: StayAlarmChoice | undefined) => void;
};

/** Calculator only: native scheduling cannot currently replace/cancel by stable identity. */
export default function StayHotelAlarmPreview({ eventId, hotelApzIso, timeZone, choice, defaultLeadMinutes, onChoice, nativeTestReady, onProgram }: Props) {
  const scope = { accountId: 'calculation-only', rosterId: 'current-view', rosterRevision: 'preview' };
  const stay = { ...scope, id: eventId, eventId, timeZone };
  const hotelApz = hotelApzIso ? { ...scope, source: 'manual', stayId: eventId, rosterEventId: eventId,
    hotelReportAt: hotelApzIso, timeZone, confirmed: true } : null;
  const calculated = calculateStayWakeup({ scope, stay, hotelApz, now: Date.now(), choice, defaultLeadMinutes });
  const mode = choice?.mode || 'auto';
  const difference = calculated.differenceMinutes;
  const differenceLabel = typeof difference === 'number' && difference > 0
    ? `${Math.floor(difference / 60) ? `${Math.floor(difference / 60)} h ` : ''}${difference % 60 ? `${difference % 60} min ` : ''}antes da APZ no hotel`.trim() : null;
  const alarmZone = choice?.mode === 'absolute' ? choice.timeZone || timeZone : timeZone;
  let absoluteLocal = '';
  try {
    if (choice?.mode === 'absolute' && choice.alarmAt && alarmZone) {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: alarmZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(choice.alarmAt)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
      absoluteLocal = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
    }
  } catch {}
  return <section className="cc139-card" aria-label="Prévia do despertador do pernoite">
    <h2>Despertador deste pernoite</h2>
    <p>A referência é a APZ no hotel. APZ da escala, check-in, decolagem e pickup não a substituem.</p>
    <details><summary>Configurar despertador</summary><div className="cc139-form">
      <label>Modo do despertador<select value={mode} onChange={event => onChoice(event.target.value === 'absolute'
        ? { mode: 'absolute', alarmAt: '', timeZone } : event.target.value === 'relative' ? { mode: 'relative' } : undefined)}>
        <option value="auto">Auto · antecedência padrão</option><option value="relative">Antecedência individual</option><option value="absolute">Horário exato</option></select></label>
      {mode !== 'absolute' ? <>
        <label>Antecedência deste pernoite<select value={!choice ? 'default' : String(choice.mode === 'relative' ? choice.leadMinutes ?? '' : '')}
          onChange={event => onChoice(event.target.value === 'default' ? undefined : { mode: 'relative', leadMinutes: Number(event.target.value) })}>
          <option value="default">Usar padrão {defaultLeadMinutes === undefined ? '(não configurado)' : `(${defaultLeadMinutes} min)`}</option>
          <option value="">Escolher antecedência individual</option>
          <option value="90">90 min</option><option value="60">60 min</option>
          {choice?.mode === 'relative' && Number.isInteger(choice.leadMinutes) && ![60, 90].includes(choice.leadMinutes || 0) && <option value={choice.leadMinutes}>Personalizada · {choice.leadMinutes} min</option>}
        </select></label>
        <label>Antecedência personalizada (minutos)<input type="number" min="0" max="720" value={choice?.mode === 'relative' && Number.isInteger(choice.leadMinutes) ? choice.leadMinutes : ''}
          onChange={event => onChoice({ mode: 'relative', leadMinutes: event.target.value === '' ? undefined : Number(event.target.value) })}/></label>
      </> : <label className="wide">Data e horário exatos · {alarmZone || 'confirme o fuso'}<input type="datetime-local" value={absoluteLocal}
        onChange={event => { const [day, clock] = event.target.value.split('T'); const epoch = stayLocalInstant(day, clock, alarmZone);
          onChoice({ mode: 'absolute', alarmAt: epoch === null ? '' : new Date(epoch).toISOString(), timeZone: alarmZone }); }}/></label>}
    </div></details>
    <p><strong>Modo ativo: {mode === 'auto' ? 'Auto · antecedência padrão' : mode === 'absolute' ? 'horário exato' : 'antecedência individual da APZ no hotel'}</strong></p>
    {mode === 'auto' && <p>Auto calcula a partir da APZ no hotel confirmada menos o padrão configurado. Sem esses dados, informe-os ou personalize este pernoite.</p>}
    {calculated.action === 'calculated' ? <>
      <p role="status"><strong>Despertar calculado: {calculated.display.clock} · {calculated.display.date} · {calculated.display.timeZone}</strong></p>
      {differenceLabel && <p role="status">{differenceLabel}</p>}
      {calculated.warnings.includes('alarm-not-before-hotel-apz') && <p role="alert">O horário escolhido não é anterior à APZ no hotel. Sua escolha foi mantida; revise antes de programar.</p>}
      {calculated.warnings.includes('alarm-past') && <p role="alert">O horário escolhido já passou. Sua escolha foi mantida.</p>}
      {!calculated.hotelReportAt && <p role="alert">APZ no hotel ausente ou não confirmada. Informe-a manualmente antes de programar.</p>}
    </> : <p role="status">{!timeZone ? 'Confirme o fuso do hotel para calcular.' : !hotelApzIso && mode !== 'absolute' ? 'APZ no hotel ausente. Informe-a manualmente.' : 'Informe data, horário e antecedência válidos.'}</p>}
    {nativeTestReady && calculated.action === 'calculated' && calculated.scheduledAt && calculated.hotelReportAt &&
      <button type="button" onClick={() => onProgram?.(calculated.scheduledAt, calculated.hotelReportAt)}>Confirmar tentativa de notificação neste aparelho</button>}
    <p>{nativeTestReady ? 'A tentativa de notificação exige confirmação explícita; recibo não confirma entrega ou som.' : 'Calculado; não programado no dispositivo. A substituição e o cancelamento de alarmes por pernoite ainda não estão disponíveis nesta integração.'}</p>
    <p>A edição deste pernoite não altera a antecedência padrão. Salve as alterações para mantê-las nesta conta e neste aparelho. Dados MyCrewCare continuam desligados.</p>
  </section>;
}
