import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calculator, CheckCircle2, Clock3, Plane, RotateCcw, ShieldCheck } from 'lucide-react';
import './v1392.css';

type LegalRole = 'cabin' | 'pilot';
type DutyOrigin = 'presentation' | 'reserve-activation' | 'standby-activation';

type FormState = {
  role: LegalRole;
  dutyOrigin: DutyOrigin;
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

const STORAGE_KEY = 'crewcheck:manual-regulation:v1392';

const DEFAULT_FORM: FormState = {
  role: 'cabin',
  dutyOrigin: 'presentation',
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

function hoursLabel(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  return `${Math.floor(safe / 60)}h${String(safe % 60).padStart(2, '0')}`;
}

function loadForm(): FormState {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...DEFAULT_FORM, ...parsed, sectors: Number(parsed.sectors || DEFAULT_FORM.sectors), flightMinutes: Number(parsed.flightMinutes || 0), extensionMinutes: Number(parsed.extensionMinutes || 0) };
  } catch {
    return DEFAULT_FORM;
  }
}

export default function ManualRegulationView({ compliance }: { compliance?: ComplianceLike }) {
  const [form, setForm] = useState<FormState>(loadForm);
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
    const dutyLimitMinutes = row.duty[index] * 60;
    const flightLimitMinutes = row.flight[index] * 60;
    const withinDuty = projectedDutyMinutes <= dutyLimitMinutes;
    const withinFlight = form.flightMinutes <= 0 || form.flightMinutes <= flightLimitMinutes;
    return {
      row,
      baseDutyMinutes,
      projectedDutyMinutes,
      dutyLimitMinutes,
      flightLimitMinutes,
      withinDuty,
      withinFlight,
      remainingMinutes: dutyLimitMinutes - projectedDutyMinutes,
      maximumEnd: clockFrom(start, dutyLimitMinutes),
      projectedEnd: clockFrom(start, projectedDutyMinutes),
    };
  }, [form]);

  const alerts = (compliance?.alerts || []).filter((item) => item.classification !== 'informativa').slice(0, 4);
  const actName = form.role === 'pilot' ? 'ACT Pilotos 2025–2027' : 'ACT Comissários 2025–2027';
  const activityLabel = form.dutyOrigin === 'reserve-activation' ? 'início da reserva acionada' : form.dutyOrigin === 'standby-activation' ? 'início operacional após acionamento do sobreaviso' : 'apresentação';

  return <>
    <section className="cz-panel-head cz-regulation-heading">
      <div><small>CÁLCULO MANUAL</small><h1>Regulamentação</h1><p>Simule jornada, voo e extensão usando a Tabela B.1 e a ACT selecionada. O cálculo automático da escala continua logo abaixo.</p></div>
      <span><ShieldCheck/> {actName}</span>
    </section>

    <section className="cc-reg-grid">
      <article className="cc-reg-form">
        <header><Calculator/><div><h2>Dados da programação</h2><p>Use os horários publicados ou efetivamente realizados.</p></div></header>
        <div className="cz-form-grid">
          <label><span>Regime aplicável</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as LegalRole })}><option value="cabin">ACT Comissários 2025–2027</option><option value="pilot">ACT Pilotos 2025–2027</option></select></label>
          <label><span>Origem da jornada</span><select value={form.dutyOrigin} onChange={(event) => setForm({ ...form, dutyOrigin: event.target.value as DutyOrigin })}><option value="presentation">Apresentação normal</option><option value="reserve-activation">Reserva acionada</option><option value="standby-activation">Sobreaviso acionado</option></select></label>
          <label><span>{activityLabel}</span><input type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })}/></label>
          <label><span>Término publicado</span><input type="time" value={form.plannedEndTime} onChange={(event) => setForm({ ...form, plannedEndTime: event.target.value })}/></label>
          <label><span>Número de etapas</span><input type="number" min="1" max="9" value={form.sectors} onChange={(event) => setForm({ ...form, sectors: Math.max(1, Math.min(9, Number(event.target.value || 1))) })}/></label>
          <label><span>Tempo de voo acumulado</span><input type="number" min="0" step="15" value={form.flightMinutes} onChange={(event) => setForm({ ...form, flightMinutes: Math.max(0, Number(event.target.value || 0)) })}/><small>Minutos; deixe 0 se ainda não souber.</small></label>
          <label><span>Extensão a avaliar</span><select value={form.extensionMinutes} onChange={(event) => setForm({ ...form, extensionMinutes: Number(event.target.value) })}><option value="0">Sem extensão</option><option value="30">30 minutos</option><option value="60">1 hora</option><option value="90">1h30</option><option value="120">2 horas</option></select></label>
          <label><span>Motivo informado</span><select value={form.extensionReason} onChange={(event) => setForm({ ...form, extensionReason: event.target.value })}><option value="imprevisto-operacional">Imprevisto operacional</option><option value="meteorologia">Meteorologia</option><option value="assistencia-medica">Assistência médica</option><option value="seguranca">Segurança operacional</option><option value="outro">Outro motivo documentado</option></select></label>
        </div>
        <button className="cc-reg-reset" onClick={() => setForm(DEFAULT_FORM)}><RotateCcw/> Limpar simulação</button>
      </article>

      <article className={`cc-reg-result ${result?.withinDuty && result?.withinFlight ? 'ok' : 'danger'}`}>
        <header>{result?.withinDuty && result?.withinFlight ? <CheckCircle2/> : <AlertTriangle/>}<div><small>RESULTADO DA SIMULAÇÃO</small><h2>{result?.withinDuty && result?.withinFlight ? 'Dentro dos limites calculados' : 'Limite excedido ou dado inválido'}</h2></div></header>
        {result ? <>
          <div className="cc-reg-kpis">
            <span><b>Jornada projetada</b><strong>{hoursLabel(result.projectedDutyMinutes)}</strong><small>com extensão</small></span>
            <span><b>Limite de jornada</b><strong>{hoursLabel(result.dutyLimitMinutes)}</strong><small>Tabela B.1</small></span>
            <span><b>Término projetado</b><strong>{result.projectedEnd}</strong><small>máximo {result.maximumEnd}</small></span>
            <span><b>Margem</b><strong>{result.remainingMinutes >= 0 ? hoursLabel(result.remainingMinutes) : `−${hoursLabel(Math.abs(result.remainingMinutes))}`}</strong><small>{result.remainingMinutes >= 0 ? 'até o teto' : 'acima do teto'}</small></span>
          </div>
          <div className="cc-reg-evidence"><p><b>Enquadramento:</b> início {result.row.label}, {sectorLabel(form.sectors)} etapa(s), voo máximo {hoursLabel(result.flightLimitMinutes)}.</p><p><b>Hierarquia:</b> regra mais restritiva entre {actName}, RBAC 117 e demais normas aplicáveis.</p></div>
          {form.extensionMinutes > 0 && <div className="cc-reg-extension"><Clock3/><div><strong>Extensão condicionada — não é autorização automática</strong><p>{result.withinDuty ? 'A projeção permanece dentro do teto numérico da Tabela B.1. Ainda exige hipótese válida, avaliação operacional, registro e os requisitos da ACT/SGRF e do manual aprovado do operador.' : 'A projeção ultrapassa o teto numérico calculado. O CrewCheck não classifica esta extensão como compatível.'}</p></div></div>}
          {form.dutyOrigin === 'reserve-activation' && <div className="cc-reg-note"><Plane/><p>Reserva acionada: o cálculo parte do início da reserva informado, preservando o tratamento mais restritivo do motor CrewCheck.</p></div>}
          {form.dutyOrigin === 'standby-activation' && <div className="cc-reg-note"><Plane/><p>Sobreaviso acionado: informe como início o marco operacional aplicável ao acionamento. Madrugada e tempo total de sobreaviso continuam avaliados separadamente.</p></div>}
        </> : <p className="cc-reg-invalid">Preencha horários válidos para calcular.</p>}
      </article>
    </section>

    <section className="cc-reg-automatic">
      <header><ShieldCheck/><div><h2>Análise automática da escala</h2><p>Mesma fonte canônica usada nos cards, carga e alertas.</p></div><strong>{Number.isFinite(Number(compliance?.score)) ? `${compliance?.score}/100` : 'Aguardando escala'}</strong></header>
      {alerts.length ? <div>{alerts.map((alert, index) => <article key={`${alert.title}-${index}`}><AlertTriangle/><span><b>{alert.title || 'Ponto de atenção'}</b><small>{alert.description || 'Abra Irregularidades para os detalhes.'}</small></span></article>)}</div> : <p>{compliance?.summary || 'Nenhum alerta regulatório acionável na escala ativa.'}</p>}
      <button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'alerts' }))}>Abrir irregularidades completas</button>
    </section>

    <section className="cc-reg-disclaimer"><AlertTriangle/><p>Ferramenta de apoio. Uma extensão depende do contexto real, ACT, RBAC 117, SGRF/manual aprovado e decisão operacional competente; o resultado numérico não substitui a fonte oficial.</p></section>
  </>;
}
