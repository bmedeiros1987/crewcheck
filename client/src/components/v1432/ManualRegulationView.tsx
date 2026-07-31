import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Calculator, CheckCircle2, Clock3, Plane, RotateCcw, ShieldCheck } from 'lucide-react';
import '../v1392/v1392.css';

type LegalRole = 'cabin' | 'pilot';
type DutyOrigin = 'presentation' | 'reserve-activation' | 'standby-activation';
type Acclimatization = 'acclimatized' | 'unknown';

type ScheduleLegLike = {
  departureTime?: string | null;
  arrivalTime?: string | null;
  duration?: number | null;
};

export type ScheduleDayLike = {
  date?: string | null;
  type?: string | null;
  pairingCode?: string | null;
  dutyReport?: string | null;
  dutyDebrief?: string | null;
  dutyHours?: number | null;
  flyingHours?: number | null;
  isNextDay?: boolean;
  legs?: ScheduleLegLike[] | null;
};

type FormState = {
  role: LegalRole;
  dutyOrigin: DutyOrigin;
  acclimatization: Acclimatization;
  startTime: string;
  plannedEndTime: string;
  sectors: number;
  flightMinutes: number;
  extensionMinutes: number;
  extensionReason: string;
};

type ComplianceLike = {
  score?: number;
  summary?: string;
  alerts?: Array<{ title?: string; description?: string; severity?: string; classification?: string }>;
};

export type DayRegulationResult = {
  status: 'ready' | 'waiting' | 'invalid';
  label: string;
  startTime?: string;
  cutoffTime?: string;
  dutyEndTime?: string;
  dutyLimitMinutes?: number;
  sectors?: number;
};

const STORAGE_KEY = 'crewcheck:manual-regulation:v1432';

const DEFAULT_FORM: FormState = {
  role: 'cabin',
  dutyOrigin: 'presentation',
  acclimatization: 'acclimatized',
  startTime: '08:00',
  plannedEndTime: '17:00',
  sectors: 2,
  flightMinutes: 0,
  extensionMinutes: 0,
  extensionReason: 'imprevisto-operacional',
};

const B1 = [
  { from: 360, to: 419, label: '06h00–06h59', duty: [11, 11, 10, 9, 9], flight: [9, 9, 8, 8, 8] },
  { from: 420, to: 479, label: '07h00–07h59', duty: [13, 12, 11, 10, 9], flight: [9.5, 9, 9, 8, 8] },
  { from: 480, to: 719, label: '08h00–11h59', duty: [13, 13, 12, 11, 10], flight: [10, 9.5, 9, 9, 8] },
  { from: 720, to: 839, label: '12h00–13h59', duty: [12, 12, 11, 10, 9], flight: [9.5, 9, 9, 8, 8] },
  { from: 840, to: 959, label: '14h00–15h59', duty: [11, 11, 10, 9, 9], flight: [9, 9, 8, 8, 8] },
  { from: 960, to: 1079, label: '16h00–17h59', duty: [10, 10, 9, 9, 9], flight: [8, 8, 8, 8, 8] },
  { from: 1080, to: 1799, label: '18h00–05h59', duty: [9, 9, 9, 9, 9], flight: [8, 8, 7, 7, 7] },
] as const;

function timeMinutes(value: string): number | null {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function durationMinutes(start: number, end: number): number {
  return end >= start ? end - start : end + 1440 - start;
}

function sectorIndex(sectors: number): 0 | 1 | 2 | 3 | 4 {
  if (sectors <= 2) return 0;
  if (sectors <= 4) return 1;
  if (sectors === 5) return 2;
  if (sectors === 6) return 3;
  return 4;
}

function sectorLabel(sectors: number): string {
  if (sectors <= 2) return '1–2';
  if (sectors <= 4) return '3–4';
  if (sectors === 5) return '5';
  if (sectors === 6) return '6';
  return '7+';
}

function clockFrom(start: number, elapsed: number): string {
  const total = start + elapsed;
  const day = Math.floor(total / 1440);
  const minuteOfDay = ((total % 1440) + 1440) % 1440;
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}${day ? ` +${day}d` : ''}`;
}

function simpleClock(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function hoursLabel(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  return `${Math.floor(safe / 60)}h${String(safe % 60).padStart(2, '0')}`;
}

function dayCode(day?: ScheduleDayLike | null): string {
  return String(day?.pairingCode || day?.type || '').trim().toUpperCase();
}

function isWaitingActivation(day?: ScheduleDayLike | null): boolean {
  const code = dayCode(day);
  return /^(ASB|RES|RSV|HSB|HSBE)$/.test(code) && !(day?.legs || []).length;
}

function dutyOriginForDay(day?: ScheduleDayLike | null): DutyOrigin {
  const code = dayCode(day);
  if (/^(ASB|RES|RSV)$/.test(code)) return 'reserve-activation';
  if (/^(HSB|HSBE)$/.test(code)) return 'standby-activation';
  return 'presentation';
}

function scheduleStart(day?: ScheduleDayLike | null): string {
  const direct = String(day?.dutyReport || '').match(/\d{1,2}:\d{2}/)?.[0];
  if (direct) return direct.padStart(5, '0');
  const departure = String(day?.legs?.[0]?.departureTime || '').match(/\d{1,2}:\d{2}/)?.[0];
  const minutes = departure ? timeMinutes(departure.padStart(5, '0')) : null;
  return minutes === null ? DEFAULT_FORM.startTime : simpleClock(minutes - 60);
}

function scheduleEnd(day?: ScheduleDayLike | null): string {
  const direct = String(day?.dutyDebrief || '').match(/\d{1,2}:\d{2}/)?.[0];
  if (direct) return direct.padStart(5, '0');
  const legs = day?.legs || [];
  const arrival = String(legs.at(-1)?.arrivalTime || '').match(/\d{1,2}:\d{2}/)?.[0];
  const minutes = arrival ? timeMinutes(arrival.padStart(5, '0')) : null;
  return minutes === null ? DEFAULT_FORM.plannedEndTime : simpleClock(minutes + 30);
}

function scheduleFlightMinutes(day?: ScheduleDayLike | null): number {
  if (Number(day?.flyingHours || 0) > 0) return Math.round(Number(day?.flyingHours) * 60);
  return (day?.legs || []).reduce((total, leg) => {
    if (Number(leg.duration || 0) > 0) return total + Number(leg.duration);
    const start = timeMinutes(String(leg.departureTime || '').padStart(5, '0'));
    const end = timeMinutes(String(leg.arrivalTime || '').padStart(5, '0'));
    return total + (start !== null && end !== null ? durationMinutes(start, end) : 0);
  }, 0);
}

function formFromScheduleDay(day?: ScheduleDayLike | null): FormState {
  if (!day) return DEFAULT_FORM;
  return {
    ...DEFAULT_FORM,
    dutyOrigin: dutyOriginForDay(day),
    startTime: scheduleStart(day),
    plannedEndTime: scheduleEnd(day),
    sectors: Math.max(1, Math.min(9, day.legs?.length || 1)),
    flightMinutes: scheduleFlightMinutes(day),
  };
}

function loadForm(): FormState {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...DEFAULT_FORM, ...parsed, sectors: Number(parsed.sectors || DEFAULT_FORM.sectors), flightMinutes: Number(parsed.flightMinutes || 0), extensionMinutes: Number(parsed.extensionMinutes || 0) };
  } catch {
    return DEFAULT_FORM;
  }
}

export function regulationForScheduleDay(day?: ScheduleDayLike | null): DayRegulationResult {
  const code = dayCode(day);
  if (!day) return { status: 'invalid', label: 'Sem programação' };
  if (isWaitingActivation(day)) return { status: 'waiting', label: 'Aguardando acionamento' };
  const startText = scheduleStart(day);
  const start = timeMinutes(startText);
  if (start === null) return { status: 'invalid', label: 'Apresentação a confirmar' };
  const normalizedStart = start < 360 ? start + 1440 : start;
  const row = B1.find((item) => normalizedStart >= item.from && normalizedStart <= item.to);
  if (!row) return { status: 'invalid', label: 'Limite a confirmar' };
  const sectors = Math.max(1, Math.min(9, day.legs?.length || 1));
  const dutyLimitMinutes = row.duty[sectorIndex(sectors)] * 60;
  return {
    status: 'ready',
    label: code || 'Programação',
    startTime: startText,
    cutoffTime: clockFrom(start, dutyLimitMinutes - 30),
    dutyEndTime: clockFrom(start, dutyLimitMinutes),
    dutyLimitMinutes,
    sectors,
  };
}

export default function ManualRegulationView({ compliance, scheduleDay }: { compliance?: ComplianceLike; scheduleDay?: ScheduleDayLike | null }) {
  const [form, setForm] = useState<FormState>(loadForm);
  const hydratedSchedule = useRef('');
  const scheduleSignature = [scheduleDay?.date, dayCode(scheduleDay), scheduleDay?.dutyReport, scheduleDay?.dutyDebrief, scheduleDay?.legs?.length].join('|');

  useEffect(() => {
    if (!scheduleDay || hydratedSchedule.current === scheduleSignature) return;
    hydratedSchedule.current = scheduleSignature;
    setForm(formFromScheduleDay(scheduleDay));
  }, [scheduleDay, scheduleSignature]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(form)); }, [form]);

  const result = useMemo(() => {
    const start = timeMinutes(form.startTime);
    const plannedEnd = timeMinutes(form.plannedEndTime);
    if (start === null || plannedEnd === null) return null;
    const normalizedStart = start < 360 ? start + 1440 : start;
    const row = B1.find((item) => normalizedStart >= item.from && normalizedStart <= item.to);
    if (!row) return null;
    const index = sectorIndex(Math.max(1, Math.min(9, form.sectors)));
    const baseDutyMinutes = durationMinutes(start, plannedEnd);
    const projectedDutyMinutes = baseDutyMinutes + Math.max(0, form.extensionMinutes);
    const acclimatizationReduction = form.acclimatization === 'unknown' ? 60 : 0;
    const dutyLimitMinutes = row.duty[index] * 60 - acclimatizationReduction;
    const flightLimitMinutes = row.flight[index] * 60 - acclimatizationReduction;
    const withinDuty = projectedDutyMinutes <= dutyLimitMinutes;
    const withinFlight = form.flightMinutes <= 0 || form.flightMinutes <= flightLimitMinutes;
    return {
      row,
      baseDutyMinutes,
      projectedDutyMinutes,
      dutyLimitMinutes,
      flightLimitMinutes,
      acclimatizationReduction,
      withinDuty,
      withinFlight,
      remainingMinutes: dutyLimitMinutes - projectedDutyMinutes,
      maximumCutoff: clockFrom(start, dutyLimitMinutes - 30),
      maximumDutyEnd: clockFrom(start, dutyLimitMinutes),
      publishedCutoff: clockFrom(start, Math.max(0, baseDutyMinutes - 30)),
      projectedEnd: clockFrom(start, projectedDutyMinutes),
    };
  }, [form]);

  const alerts = (compliance?.alerts || []).filter((item) => item.classification !== 'informativa').slice(0, 4);
  const regulatoryProfile = form.role === 'pilot' ? 'Tripulante de voo · RBAC 117 B.1' : 'Tripulante de cabine · RBAC 117 B.1';
  const activityLabel = form.dutyOrigin === 'reserve-activation' ? 'início da reserva acionada' : form.dutyOrigin === 'standby-activation' ? 'início operacional após acionamento do sobreaviso' : 'apresentação';
  const waitingActivation = isWaitingActivation(scheduleDay);
  const scheduleLabel = scheduleDay?.date ? `Programação de ${scheduleDay.date}` : 'Simulação sem escala ativa';

  return <>
    <section className="cz-panel-head cz-regulation-heading cc-readable-surface">
      <div><small>CÁLCULO MANUAL E AUTOMÁTICO</small><h1>Regulamentação</h1><p>O CrewCheck preenche a programação do dia. Você pode alterar qualquer campo para simular outro cenário.</p></div>
      <span><ShieldCheck/> {regulatoryProfile}</span>
    </section>

    <section className="cc-reg-schedule-source cc-readable-surface">
      <span><Clock3/><b>{scheduleLabel}</b></span>
      <p>{scheduleDay ? 'Horários e etapas carregados da escala ativa; ajustes manuais valem apenas para esta simulação.' : 'Importe ou sincronize uma escala para preencher os horários automaticamente.'}</p>
    </section>

    {waitingActivation && <section className="cc-reg-waiting cc-readable-surface"><Plane/><div><strong>Aguardando acionamento</strong><p>{dayCode(scheduleDay)} publicado. O horário de corte e o fim da jornada serão calculados quando o início operacional for confirmado; você já pode simular esse acionamento abaixo.</p></div></section>}

    <section className="cc-reg-grid">
      <article className="cc-reg-form cc-readable-surface">
        <header><Calculator/><div><h2>Dados da programação</h2><p>Use os horários publicados ou efetivamente realizados.</p></div></header>
        <div className="cz-form-grid">
          <label><span>Função</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as LegalRole })}><option value="cabin">Tripulante de cabine</option><option value="pilot">Tripulante de voo</option></select></label>
          <label><span>Origem da jornada</span><select value={form.dutyOrigin} onChange={(event) => setForm({ ...form, dutyOrigin: event.target.value as DutyOrigin })}><option value="presentation">Apresentação normal</option><option value="reserve-activation">Reserva acionada</option><option value="standby-activation">Sobreaviso acionado</option></select></label>
          <label><span>Estado de aclimatação</span><select value={form.acclimatization} onChange={(event) => setForm({ ...form, acclimatization: event.target.value as Acclimatization })}><option value="acclimatized">Aclimatado</option><option value="unknown">Desconhecido (redução de 1 h)</option></select><small>O RBAC 117 determina redução de 1 h quando o estado é desconhecido.</small></label>
          <label><span>{activityLabel}</span><input type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })}/></label>
          <label><span>Fim publicado da jornada</span><input type="time" value={form.plannedEndTime} onChange={(event) => setForm({ ...form, plannedEndTime: event.target.value })}/><small>O fim da jornada ocorre 30 min após o corte.</small></label>
          <label><span>Número de etapas</span><input type="number" min="1" max="9" value={form.sectors} onChange={(event) => setForm({ ...form, sectors: Math.max(1, Math.min(9, Number(event.target.value || 1))) })}/></label>
          <label><span>Tempo de voo acumulado</span><input type="number" min="0" step="15" value={form.flightMinutes} onChange={(event) => setForm({ ...form, flightMinutes: Math.max(0, Number(event.target.value || 0)) })}/><small>Minutos; deixe 0 se ainda não souber.</small></label>
          <label><span>Extensão a avaliar</span><select value={form.extensionMinutes} onChange={(event) => setForm({ ...form, extensionMinutes: Number(event.target.value) })}><option value="0">Sem extensão</option><option value="30">30 minutos</option><option value="60">1 hora</option><option value="90">1h30</option><option value="120">2 horas</option></select></label>
          <label><span>Motivo informado</span><select value={form.extensionReason} onChange={(event) => setForm({ ...form, extensionReason: event.target.value })}><option value="imprevisto-operacional">Imprevisto operacional</option><option value="meteorologia">Meteorologia</option><option value="assistencia-medica">Assistência médica</option><option value="seguranca">Segurança operacional</option><option value="outro">Outro motivo documentado</option></select></label>
        </div>
        <button className="cc-reg-reset" onClick={() => setForm(formFromScheduleDay(scheduleDay))}><RotateCcw/> Restaurar dados da programação</button>
      </article>

      <article className={`cc-reg-result cc-readable-surface ${result?.withinDuty && result?.withinFlight ? 'ok' : 'danger'}`}>
        <header>{result?.withinDuty && result?.withinFlight ? <CheckCircle2/> : <AlertTriangle/>}<div><small>RESULTADO DA SIMULAÇÃO</small><h2>{result?.withinDuty && result?.withinFlight ? 'Dentro dos limites calculados' : 'Limite excedido ou dado inválido'}</h2></div></header>
        {result ? <>
          <div className="cc-reg-kpis">
            <span className="highlight"><b>Horário do corte</b><strong>{result.maximumCutoff}</strong><small>limite operacional calculado</small></span>
            <span className="highlight"><b>Fim da jornada</b><strong>{result.maximumDutyEnd}</strong><small>30 min após o corte</small></span>
            <span><b>Jornada projetada</b><strong>{hoursLabel(result.projectedDutyMinutes)}</strong><small>término {result.projectedEnd}</small></span>
            <span><b>Margem</b><strong>{result.remainingMinutes >= 0 ? hoursLabel(result.remainingMinutes) : `−${hoursLabel(Math.abs(result.remainingMinutes))}`}</strong><small>{result.remainingMinutes >= 0 ? 'até o teto' : 'acima do teto'}</small></span>
          </div>
          <div className="cc-reg-evidence"><p><b>Programação informada:</b> corte previsto {result.publishedCutoff} e fim da jornada {form.plannedEndTime}.</p><p><b>Enquadramento:</b> Tabela B.1, tripulação mínima/simples, início {result.row.label}, {sectorLabel(form.sectors)} etapa(s), jornada máxima {hoursLabel(result.dutyLimitMinutes)} e voo máximo {hoursLabel(result.flightLimitMinutes)}.</p><p><b>Aclimatação:</b> {form.acclimatization === 'unknown' ? 'estado desconhecido; aplicada a redução conservadora de 1 hora.' : 'tripulante informado como aclimatado.'}</p><p><b>Hierarquia:</b> aplicar a regra mais restritiva entre ACT/CCT vigente, RBAC 117, SGRF/manual aprovado e demais normas aplicáveis.</p></div>
          {form.extensionMinutes > 0 && <div className="cc-reg-extension"><Clock3/><div><strong>Extensão condicionada — não é autorização automática</strong><p>{result.withinDuty ? 'A projeção permanece dentro do teto numérico. Ainda exige hipótese válida, avaliação operacional, registro e os requisitos da ACT/SGRF e do manual aprovado do operador.' : 'A projeção ultrapassa o teto numérico calculado. O CrewCheck não classifica esta extensão como compatível.'}</p></div></div>}
          {form.dutyOrigin === 'reserve-activation' && <div className="cc-reg-note"><Plane/><p>Reserva acionada: o cálculo parte do início da reserva informado, preservando o tratamento mais restritivo do motor CrewCheck.</p></div>}
          {form.dutyOrigin === 'standby-activation' && <div className="cc-reg-note"><Plane/><p>Sobreaviso acionado: informe o marco operacional aplicável ao acionamento. Madrugada e tempo total de sobreaviso continuam avaliados separadamente.</p></div>}
        </> : <p className="cc-reg-invalid">Preencha horários válidos para calcular.</p>}
      </article>
    </section>

    <section className="cc-reg-automatic cc-readable-surface">
      <header><ShieldCheck/><div><h2>Análise automática da escala</h2><p>Mesma fonte canônica usada nos cards, carga e alertas.</p></div><strong>{Number.isFinite(Number(compliance?.score)) ? `${compliance?.score}/100` : 'Aguardando escala'}</strong></header>
      {alerts.length ? <div>{alerts.map((alert, index) => <article key={`${alert.title}-${index}`}><AlertTriangle/><span><b>{alert.title || 'Ponto de atenção'}</b><small>{alert.description || 'Abra Irregularidades para os detalhes.'}</small></span></article>)}</div> : <p>{compliance?.summary || 'Nenhum alerta regulatório acionável na escala ativa.'}</p>}
      <button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'alerts' }))}>Abrir irregularidades completas</button>
    </section>

    <section className="cc-reg-disclaimer cc-readable-surface"><AlertTriangle/><p>Ferramenta de apoio. O corte e o fim da jornada dependem dos dados confirmados, contexto real, ACT, RBAC 117, SGRF/manual aprovado e decisão operacional competente; o resultado não substitui a fonte oficial.</p></section>
  </>;
}