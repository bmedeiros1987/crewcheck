import { useId, useState } from 'react';
import { ChevronDown, Clock, DoorOpen, Pencil, Plane, Watch } from 'lucide-react';
import { setPendingNavigationContext } from '@/lib/navigationContext';
import { gateDisplay, statusSourceLabel, selectNextFlight, type NextFlightGateInfo, type NextFlightLike } from '@/lib/nextFlightGate';
import { useNextFlightGate, useWatchSyncState } from './useNextFlightGate';
import { ManualGateReview, sourceGateUpdateLabel } from './ManualGateReview';
import './next-flight-gate.css';

function clock(epochMs: number): string {
  if (!epochMs) return '';
  const date = new Date(epochMs);
  const sameDay = date.toDateString() === new Date().toDateString();
  const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
  return sameDay ? time : `${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date)} ${time}`;
}

function flightDate(info: NextFlightGateInfo): string {
  if (!info.operationalDate) return 'Data não informada';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit' })
    .format(new Date(`${info.operationalDate}T12:00:00Z`)).replace('.', '');
}

export function gateSourceLabel(info: NextFlightGateInfo): string {
  if (info.gateSource === 'manual') return `${info.manual?.sourceReview?.action === 'accept' ? 'Aceito' : 'Informado'} por ${info.manual?.author || 'você'} em ${sourceGateUpdateLabel(info.manual?.setAtEpochMs || 0)}`;
  if (info.gateSource === 'radar') return `Radar · atualizado ${clock(info.radarUpdatedAtEpochMs) || 'sem horário'}`;
  if (info.gateSource === 'roster') return 'Escala publicada';
  return 'Portão automático ainda não confirmado';
}

function openRadar(event: NextFlightLike, info: NextFlightGateInfo) {
  // Contexto explícito: o Radar abre exatamente este voo, nunca outro selecionado por ele.
  setPendingNavigationContext({
    sourceView: 'home-roster',
    targetView: 'radar',
    programId: event.id,
    dateEpochMs: Number.isFinite(info.departureEpochMs) ? info.departureEpochMs : undefined,
    flightKey: info.flight || undefined,
    airportCode: info.origin || undefined,
    returnView: 'cockpit',
    returnLabel: 'Voltar ao início',
    policy: 'persistent-until-return',
  });
  window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'radar' }));
}

/** Card compacto do próximo voo, exibido abaixo da Escala rápida. Detalhes só ao tocar. */
export function NextFlightGateCard({ events }: { events: readonly NextFlightLike[] }) {
  // Recalculado a cada render (o hook renova a cada 30 s): o voo partido dá lugar ao seguinte.
  const info = useNextFlightGate(selectNextFlight(events));
  const nextFlight = info ? events.find((item) => item.id === info.eventId) || null : null;
  const sync = useWatchSyncState();
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  if (!nextFlight || !info) return null;

  const gate = gateDisplay(info);
  const status = info.status || 'Não informado';
  const state = info.stale ? 'stale' : info.gate ? 'ok' : 'missing';

  return <section className="cc-next-gate" data-gate-state={state} data-divergent={info.divergence ? 'true' : 'false'} aria-label="Próximo voo">
    <button type="button" className="cc-next-gate-summary" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen((value) => !value)}>
      <span className="cc-next-gate-head">
        <small><Plane aria-hidden="true"/> PRÓXIMO VOO</small>
        <strong>{info.flight}</strong>
        <span>{flightDate(info)}</span>
        <ChevronDown className="cc-next-gate-chevron" aria-hidden="true"/>
      </span>
      <span className="cc-next-gate-main">
        <span className="cc-next-gate-gate">
          <small><DoorOpen aria-hidden="true"/> Portão de embarque</small>
          <b>{gate}</b>
          {info.terminal && <em>Terminal {info.terminal}</em>}
        </span>
        <span className="cc-next-gate-facts">
          <span><small>Partida</small><b>{info.departure || 'Não informada'}</b></span>
          <span><small>Status</small><b>{status}</b><small>{statusSourceLabel(info)}</small></span>
        </span>
      </span>
      {info.divergence && <span className="cc-next-gate-divergence" role="note">
        {info.manualReview.state === 'newer' ? 'Possível mudança. ' : info.manualReview.state === 'kept' ? 'Manual mantido. ' : ''}Você informou {info.divergence.manualGate}; {info.divergence.source === 'radar' ? 'o Radar' : 'a escala'} indica {info.divergence.sourceGate}. {info.manualReview.state === 'kept' ? 'Essa atualização já foi revisada.' : info.manualReview.state === 'newer' ? 'Abra os detalhes para aceitar ou manter.' : 'Atualização posterior não comprovada; confirme no aeroporto.'}
      </span>}
      <span className="cc-next-gate-source">
        {info.stale && <b className="cc-next-gate-stale"><Clock aria-hidden="true"/> Desatualizado</b>}
        <span>{gateSourceLabel(info)}</span>
      </span>
    </button>
    {open && <div className="cc-next-gate-details" id={detailsId}>
      <dl>
        <div><dt>Trecho</dt><dd>{info.origin || '—'} → {info.destination || '—'}</dd></div>
        <div><dt>Apresentação</dt><dd>{info.presentation || 'Não informada'}</dd></div>
        <div><dt>Terminal</dt><dd>{info.terminal || 'Não informado'}</dd></div>
        <div><dt>Status</dt><dd>{status}{info.statusSource === 'radar' ? ' · Radar' : info.statusSource === 'roster' ? ' · escala' : ''}</dd></div>
        <div><dt>Fonte do portão</dt><dd>{gateSourceLabel(info)}</dd></div>
        {info.radarRejected && <div><dt>Radar</dt><dd>{info.radarRejected === 'position'
          ? 'A fonte informou posição da aeronave, não portão. Ignorada.'
          : info.radarRejected === 'not-ok'
            ? 'Sem dado confirmado da fonte.'
            : info.radarRejected === 'unproven-day'
              ? 'A fonte não informou data, hora e fuso válidos do voo. Ignorada.'
              : 'Dado de outro trecho ou dia. Ignorado.'}</dd></div>}
        {sync && <div><dt><Watch aria-hidden="true"/> Relógio</dt><dd>{sync.at
          ? (sync.ok ? `Sincronizado às ${clock(sync.at)}` : `Falha na sincronização às ${clock(sync.at)}`)
          : sync.message}</dd></div>}
      </dl>
      <ManualGateReview event={nextFlight} info={info}/>
      <p>Portão de embarque deste voo. Não é a posição da aeronave nem o portão do voo anterior. Confirme sempre nas comunicações oficiais.</p>
      <button type="button" onClick={() => openRadar(nextFlight, info)}><Pencil aria-hidden="true"/> Abrir Radar e informar portão</button>
    </div>}
  </section>;
}
