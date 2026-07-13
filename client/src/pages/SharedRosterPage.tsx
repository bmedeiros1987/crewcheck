import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, CalendarDays, Clock, Map, Plane, ShieldCheck } from 'lucide-react';
import '../visitor-v13-8.css';

type SharedPayload = {
  ok: boolean;
  owner?: { display_name?: string; displayName?: string; public_id?: string; publicId?: string };
  permissions?: Record<string, boolean>;
  roster?: { year?: number; month?: number; base?: string; days?: any[] } | null;
  stays?: any[];
  expiresAt?: string;
  message?: string;
};

function dateLabel(value: unknown) {
  const raw = String(value || '');
  const date = /^\d{4}-\d{2}-\d{2}/.test(raw) ? new Date(`${raw.slice(0, 10)}T12:00:00`) : new Date(raw);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date) : raw || 'Data a confirmar';
}

function dayTitle(day: any) {
  const legs = Array.isArray(day?.legs) ? day.legs : [];
  const first = legs[0] || {};
  const last = legs[legs.length - 1] || first;
  const route = first.origin && last.destination ? `${first.origin} → ${last.destination}` : '';
  return String(day?.type || day?.pairingCode || route || 'Programação');
}

export default function SharedRosterPage({ token }: { token: string }) {
  const [payload, setPayload] = useState<SharedPayload | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetch(`/api/platform/shares/public/${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok) throw new Error(data?.message || 'Compartilhamento indisponível.');
        if (active) setPayload(data);
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : 'Compartilhamento indisponível.'));
    return () => { active = false; };
  }, [token]);
  const ownerName = payload?.owner?.display_name || payload?.owner?.displayName || 'Tripulante CrewCheck';
  const days = useMemo(() => Array.isArray(payload?.roster?.days) ? payload!.roster!.days!.slice(0, 370) : [], [payload]);
  if (error) return <main className="cv-public"><section className="cv-state cv-error"><AlertTriangle/><h1>Link indisponível</h1><p>{error}</p></section></main>;
  if (!payload) return <main className="cv-public"><section className="cv-state"><Plane className="cv-fly"/><h1>Abrindo compartilhamento seguro…</h1></section></main>;
  return <main className="cv-public">
    <header className="cv-brand"><span><Plane/></span><div><strong>CrewCheck</strong><small>Compartilhamento temporário</small></div></header>
    <section className="cv-hero"><div><small>Escala compartilhada por</small><h1>{ownerName}</h1><p>{payload.roster?.month && payload.roster?.year ? `${String(payload.roster.month).padStart(2, '0')}/${payload.roster.year}` : 'Período selecionado'} · base {payload.roster?.base || 'a confirmar'}</p></div><ShieldCheck/></section>
    <section className="cv-notice"><Clock/><p>Este acesso expira em {payload.expiresAt ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(payload.expiresAt)) : 'prazo definido pelo titular'} e pode ser revogado antes.</p></section>
    {payload.permissions?.roster && <section className="cv-section"><header><CalendarDays/><div><h2>Escala</h2><p>Somente os dados autorizados pelo titular.</p></div></header>{days.length ? <div className="cv-days">{days.map((day, index) => <article key={`${day?.date || index}-${index}`}><time>{dateLabel(day?.date)}</time><div><h3>{dayTitle(day)}</h3>{Array.isArray(day?.legs) && day.legs.length > 0 && <p>{day.legs.map((leg: any) => [leg.flightNumber || leg.flight, leg.origin && leg.destination ? `${leg.origin}→${leg.destination}` : '', leg.departure || leg.departureTime].filter(Boolean).join(' ')).join(' · ')}</p>}<small>{[day.presentation ? `Apresentação ${day.presentation}` : '', day.hotel || day.hotelName || ''].filter(Boolean).join(' · ') || 'Detalhes não compartilhados'}</small></div></article>)}</div> : <div className="cv-empty">Nenhum dia foi compartilhado.</div>}</section>}
    {payload.permissions?.map && days.length > 0 && <section className="cv-section"><header><Map/><div><h2>Mapa do mês</h2><p>Rotas publicadas na escala compartilhada.</p></div></header><div className="cv-route-chips">{Array.from(new Set(days.flatMap((day: any) => (day.legs || []).flatMap((leg: any) => [leg.origin, leg.destination])).filter(Boolean))).map((airport) => <span key={String(airport)}>{String(airport)}</span>)}</div></section>}
    {payload.permissions?.hotels && <section className="cv-section"><header><Building2/><div><h2>Pernoites autorizados</h2><p>Quarto só aparece quando o titular habilita explicitamente.</p></div></header>{payload.stays?.length ? <div className="cv-stays">{payload.stays.map((stay, index) => <article key={`${stay.stayDate}-${index}`}><b>{dateLabel(stay.stayDate)}</b><span>{stay.hotelName || 'Hotel a confirmar'}{stay.airport ? ` · ${stay.airport}` : ''}</span><small>{[stay.room ? `Quarto ${stay.room}` : '', stay.presentationTime ? `Apresentação ${stay.presentationTime}` : ''].filter(Boolean).join(' · ') || 'Dados adicionais não compartilhados'}</small></article>)}</div> : <div className="cv-empty">Nenhum pernoite foi compartilhado.</div>}</section>}
    <footer><ShieldCheck/><span>O CrewCheck não substitui a escala oficial. Não encaminhe este link sem autorização.</span></footer>
  </main>;
}
