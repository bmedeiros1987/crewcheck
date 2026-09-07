import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Compass,
  ExternalLink,
  LoaderCircle,
  LockKeyhole,
  PlaneTakeoff,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import './voyage-integrated.css';

type VoyageStatus = {
  ok?: boolean;
  enabled?: boolean;
  title?: string;
  tagline?: string;
  launchUrl?: string;
  directBridgeConfigured?: boolean;
};

type VoyagePreview = {
  ok?: boolean;
  status?: string;
  message?: string;
  launchUrl?: string;
  shared?: boolean;
  bridge?: {
    context?: {
      status?: string;
      availability?: {
        explicitFreeDates?: string[];
        hardUnavailableDates?: string[];
        unknownDates?: string[];
      };
      planningContext?: {
        baseAirport?: string | null;
      };
    };
  };
};

type Props = {
  roster: any;
  source?: string;
  onBack?: () => void;
};

export default function VoyageIntegrated({ roster, source = 'CrewCheck', onBack }: Props) {
  const [status, setStatus] = useState<VoyageStatus | null>(null);
  const [preview, setPreview] = useState<VoyagePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const minimizedRoster = useMemo(() => minimizeRoster(roster), [roster]);
  const availability = preview?.bridge?.context?.availability;
  const freeDates = availability?.explicitFreeDates || [];
  const busyDates = availability?.hardUnavailableDates || [];
  const unknownDates = availability?.unknownDates || [];

  async function refreshStatus() {
    setError('');
    try {
      const response = await fetch('/api/voyage/integration/status', { credentials: 'include', cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.message || 'Integração indisponível.');
      setStatus(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não consegui consultar o Voyage agora.');
    }
  }

  useEffect(() => { void refreshStatus(); }, []);

  async function authorizeAndPreview() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/voyage/integration/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({
          userApprovedShare: true,
          profile: {
            baseAirport: localValue('crewcheck_base_airport') || localValue('crewcheck_home_base') || undefined,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
            locale: navigator.language || 'pt-BR'
          },
          roster: minimizedRoster,
          source
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.message || 'Não consegui conectar sua escala ao Voyage.');
      setPreview(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não consegui conectar sua escala ao Voyage.');
    } finally {
      setBusy(false);
    }
  }

  function openVoyage() {
    const target = preview?.launchUrl || status?.launchUrl;
    if (!target) {
      setError('O endereço do Voyage ainda não está configurado.');
      return;
    }
    window.location.assign(target);
  }

  return (
    <main className="voyage-integrated-shell" aria-label="Voyage integrado ao CrewCheck em modo Explorer">
      <section className="voyage-integrated-hero">
        <div className="voyage-integrated-orbit" aria-hidden="true"><PlaneTakeoff/></div>
        <div className="voyage-integrated-kicker"><Sparkles/> CREWCHECK × VOYAGE</div>
        <h1>Voyage</h1>
        <p className="voyage-integrated-tagline">Beyond the trip.</p>
        <p className="voyage-integrated-lead">
          Dentro do CrewCheck, o Voyage preserva o conceito do antigo CrewCheck Explorer: uma camada contextual para descobrir o que fazer, onde comer e como aproveitar o tempo livre ao redor da sua escala. Ele não substitui nem replica as funções operacionais do CrewCheck.
        </p>
        <div className="voyage-integrated-badges">
          <span><Compass/> Modo Explorer do tripulante</span>
          <span><ShieldCheck/> CrewCheck continua operacional</span>
          <span><CheckCircle2/> Voyage completo é um app separado</span>
        </div>
      </section>

      <section className="voyage-integrated-grid">
        <article className="voyage-integrated-card voyage-integrated-card-main">
          <header>
            <div>
              <small>Integração contextual</small>
              <h2>Use sua disponibilidade para explorar</h2>
            </div>
            <span className={`voyage-integrated-status ${status?.enabled ? 'is-ready' : ''}`}>
              {status?.enabled ? 'Conectado' : status ? 'Aguardando configuração' : 'Verificando'}
            </span>
          </header>

          <p>
            A camada Voyage usa somente uma versão minimizada da sua disponibilidade para evitar sugestões em horários de trabalho. Nomes de tripulantes, senhas, chaves de API, CPF, PNR e outros dados desnecessários não entram nessa ponte.
          </p>

          {!preview?.shared ? (
            <div className="voyage-integrated-consent">
              <CalendarDays/>
              <div>
                <strong>Usar a disponibilidade desta escala no Voyage?</strong>
                <span>Folgas explícitas podem abrir janelas de exploração. Jornadas, voos, reservas, sobreavisos e dias incertos permanecem protegidos pelo CrewCheck.</span>
              </div>
              <button className="voyage-integrated-primary" onClick={authorizeAndPreview} disabled={busy || status?.enabled === false}>
                {busy ? <LoaderCircle className="voyage-spin"/> : <Sparkles/>}
                {busy ? 'Conectando…' : 'Ativar Voyage no CrewCheck'}
              </button>
            </div>
          ) : (
            <div className="voyage-integrated-ready">
              <CheckCircle2/>
              <div>
                <strong>Voyage contextual ativado</strong>
                <span>Sua escala agora protege as sugestões de exploração sem duplicar nenhuma função operacional do CrewCheck.</span>
              </div>
            </div>
          )}

          {error && <div className="voyage-integrated-error">{error}</div>}
        </article>

        <article className="voyage-integrated-card">
          <small>Voyage dentro do CrewCheck</small>
          <h3>Descoberta, não operação</h3>
          <p>Tempo livre, entorno do pernoite, gastronomia, passeios, experiências e oportunidades contextuais. A escala apenas define onde e quando faz sentido sugerir.</p>
        </article>

        <article className="voyage-integrated-card">
          <small>Domínio CrewCheck</small>
          <h3>Operação continua aqui</h3>
          <p>Escala, apresentação, Saída Inteligente, Radar, meteorologia operacional, regulamentação, pernoite operacional, despertador, diárias e demais ferramentas de tripulante continuam nativas do CrewCheck.</p>
        </article>

        <article className="voyage-integrated-card">
          <small>Escala atual</small>
          <h3>{minimizedRoster.period || 'Período não identificado'}</h3>
          <div className="voyage-integrated-stat-row">
            <div><b>{minimizedRoster.days.length}</b><span>dias lidos</span></div>
            <div><b>{freeDates.length || '—'}</b><span>folgas liberadas</span></div>
            <div><b>{busyDates.length || '—'}</b><span>dias protegidos</span></div>
          </div>
        </article>
      </section>

      {preview?.shared && (
        <section className="voyage-integrated-availability">
          <header>
            <div>
              <small>Contexto para exploração</small>
              <h2>Janelas reconhecidas pelo Voyage</h2>
            </div>
            <button className="voyage-integrated-ghost" onClick={authorizeAndPreview} disabled={busy}><RefreshCw/> Atualizar</button>
          </header>

          <div className="voyage-integrated-date-groups">
            <DateGroup title="Folgas explícitas" dates={freeDates} tone="free" empty="Nenhuma folga explícita identificada nesta prévia."/>
            <DateGroup title="Compromissos protegidos" dates={busyDates} tone="busy" empty="Nenhum compromisso operacional retornado nesta prévia."/>
            <DateGroup title="Dias que o Voyage não vai presumir livres" dates={unknownDates} tone="unknown" empty="Nenhum dia incerto nesta prévia."/>
          </div>
        </section>
      )}

      <section className="voyage-integrated-actions">
        <button className="voyage-integrated-primary voyage-integrated-open" onClick={openVoyage} disabled={!status?.launchUrl && !preview?.launchUrl}>
          Abrir Voyage completo <ChevronRight/>
        </button>
        <span>Dentro do CrewCheck você usa o modo Explorer. O app Voyage é o produto completo para planejar e acompanhar viagens pessoais do início ao fim.</span>
        {status?.launchUrl && <a href={status.launchUrl} target="_blank" rel="noreferrer">Abrir app Voyage <ExternalLink/></a>}
        {onBack && <button className="voyage-integrated-ghost" onClick={onBack}>Voltar ao CrewCheck</button>}
      </section>
    </main>
  );
}

function DateGroup({ title, dates, tone, empty }: { title: string; dates: string[]; tone: string; empty: string }) {
  return (
    <article className={`voyage-integrated-date-group tone-${tone}`}>
      <strong>{title}</strong>
      {dates.length ? <div>{dates.slice(0, 12).map((date) => <span key={date}>{formatDate(date)}</span>)}</div> : <p>{empty}</p>}
      {dates.length > 12 && <small>+{dates.length - 12} dias</small>}
    </article>
  );
}

function minimizeRoster(roster: any) {
  const year = finiteInteger(roster?.year);
  const month = finiteInteger(roster?.month);
  const period = year && month ? `${year}-${String(month).padStart(2, '0')}` : String(roster?.period || '').slice(0, 7) || null;
  const days = Array.isArray(roster?.days) ? roster.days.slice(0, 62).map((day: any) => ({
    date: normalizeDate(day?.date || day?.localDate || day?.dayDate),
    type: String(day?.type || day?.kind || day?.status || day?.activity || '').slice(0, 80),
    startsAt: day?.startsAt || day?.presentationAt || null,
    endsAt: day?.endsAt || day?.releaseAt || null,
    legs: Array.isArray(day?.legs) ? day.legs.slice(0, 20).map((leg: any) => ({
      flightNumber: String(leg?.flightNumber || leg?.flight || leg?.number || '').slice(0, 20),
      origin: String(leg?.origin || leg?.originAirport || '').slice(0, 3),
      destination: String(leg?.destination || leg?.destinationAirport || '').slice(0, 3),
      departureAt: leg?.departureAt || leg?.departureDateTime || leg?.startsAt || null,
      arrivalAt: leg?.arrivalAt || leg?.arrivalDateTime || leg?.endsAt || null,
    })) : []
  })).filter((day: any) => day.date) : [];
  return { year, month, period, days, minimized: true };
}

function localValue(key: string) {
  try { return String(localStorage.getItem(key) || '').trim(); } catch { return ''; }
}

function finiteInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function normalizeDate(value: unknown) {
  const text = String(value || '').trim();
  const direct = text.match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
  if (direct) return direct;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(parsed).replace('.', '');
}
