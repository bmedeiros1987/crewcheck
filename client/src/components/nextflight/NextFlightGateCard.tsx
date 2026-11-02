import { useId, useState } from 'react';
import { ChevronDown, Clock, DoorOpen, Pencil, Plane, Watch } from 'lucide-react';
import { setPendingNavigationContext } from '@/lib/navigationContext';
import { gateDisplay, boardingTypeLabel, statusSourceLabel, selectNextFlight, type NextFlightGateInfo, type NextFlightLike } from '@/lib/nextFlightGate';
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
  if (info.gateSource === 'radar') return `Fonte operacional · resposta recebida ${clock(info.radarUpdatedAtEpochMs) || 'sem horário'}`;
  if (info.gateSource === 'reported') return `Informado por ${info.reportedProvider} · recebido ${clock(info.radarUpdatedAtEpochMs) || 'sem horário'} · sem hora de observação; confirme no painel do aeroporto`;
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
  const status = info.status || 'Não confirmado';
  const state = info.stale ? 'stale' : info.gate ? 'ok' : 'missing';

  return <section className="cc-next-gate" data-gate-state={state} data-divergent={info.divergence ? 'true' : 'false'} aria-label="Próximo voo">
    <button type="button" className="cc-next-gate-summary" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen((value) => !value)}>
      <span className="cc-next-gate-head">
        <small><Plane aria-hidden="true"/> PRÓXIMO VOO</small>
        <ChevronDown className="cc-next-gate-chevron" aria-hidden="true"/>
      </span>
      <span className="cc-next-gate-identity"><strong>{info.flight}</strong><span>{flightDate(info)}</span></span>
      <span className="cc-next-gate-route">{info.origin || '—'} <span aria-label="para">→</span> {info.destination || '—'}</span>
      <span className="cc-next-gate-main">
        <span className="cc-next-gate-departure"><small>Partida</small><b role={!info.departure ? 'img' : undefined} aria-label={!info.departure ? 'Partida não informada' : undefined}>{info.departure || '-'}</b></span>
        <span className="cc-next-gate-gate">
          <small><DoorOpen aria-hidden="true"/> Portão</small>
          <b role={!info.gate ? 'img' : undefined} aria-label={!info.gate ? 'Portão de embarque não confirmado' : undefined}>{info.gate ? gate : '-'}</b>
          {info.terminal && <em>Terminal {info.terminal}</em>}
          {info.manualBoardingType && <em>{boardingTypeLabel(info.boardingType)} · informado por você</em>}
        </span>
        <span className="cc-next-gate-facts"><small>Status</small><b role={!info.status ? 'img' : undefined} aria-label={!info.status ? 'Status operacional não confirmado' : undefined}>{info.status || '-'}</b></span>
      </span>
      {info.manualGateUnlinked && <span role="note">Portão informado anteriormente preservado. Confirme o vínculo com este horário de voo no editor.</span>}
      {Boolean(info.operationalConflicts?.length) && <span role="note">Há divergência nos dados operacionais. Valores manuais foram preservados; dados automáticos conflitantes não confirmam a informação.</span>}
      {info.divergence && <span className="cc-next-gate-divergence" role="note">
        {info.manualReview.state === 'newer' ? 'Possível mudança. ' : info.manualReview.state === 'kept' ? 'Manual mantido. ' : ''}Você informou {info.divergence.manualGate}; {info.divergence.source === 'radar' ? 'o Radar' : info.divergence.source === 'reported' ? info.reportedProvider : 'a escala'} indica {info.divergence.sourceGate}. {info.manualReview.state === 'kept' ? 'Essa atualização já foi revisada.' : info.manualReview.state === 'newer' ? 'Abra os detalhes para aceitar ou manter.' : 'Atualização posterior não comprovada; confirme no aeroporto.'}
      </span>}
      <span className="cc-next-gate-source">
        {info.stale && <b className="cc-next-gate-stale"><Clock aria-hidden="true"/> Desatualizado</b>}
        {info.gateSource === 'manual' && <span>Portão manual</span>}
        {info.gateSource === 'radar' && <span>Portão · fonte operacional</span>}
        {info.gateSource === 'reported' && <span className="cc-next-gate-reported">Portão informado por {info.reportedProvider} · a confirmar</span>}
        {info.gateSource === 'roster' && <span>Portão · escala publicada</span>}
        {info.statusSource && <span>Status · {info.statusSource === 'manual' ? 'manual' : 'fonte operacional'}</span>}
        <span className="cc-next-gate-disclosure">{open ? 'Fechar detalhes' : 'Ver detalhes'}</span>
      </span>
    </button>
    {open && <div className="cc-next-gate-details" id={detailsId}>
      <dl>
        <div><dt>Portão de embarque</dt><dd>{gate}</dd></div>
        <div><dt>Trecho</dt><dd>{info.origin || '—'} → {info.destination || '—'}</dd></div>
        <div><dt>Apresentação</dt><dd>{info.presentation || 'Não informada'}</dd></div>
        <div><dt>Terminal</dt><dd>{info.terminal || 'Não informado'}</dd></div>
        <div><dt>Status operacional</dt><dd>{status} · {statusSourceLabel(info)}</dd></div><div><dt>Matrícula</dt><dd>{info.registration || 'Não confirmada'}{info.registrationSource === 'manual' ? ' · informado por você' : info.registrationSource === 'radar' ? ' · fonte com evidência válida' : ''}</dd></div>{info.plannedStatus && <div><dt>Planejamento da escala</dt><dd>{info.plannedStatus}</dd></div>}{info.plannedGate && <div><dt>Portão publicado na escala</dt><dd>{info.plannedGate} · não confirma portão atual</dd></div>}
        <div><dt>Tipo de embarque</dt><dd>{boardingTypeLabel(info.boardingType)}{info.manualBoardingType ? ` · informado por ${info.manualBoardingType.author} em ${sourceGateUpdateLabel(info.manualBoardingType.setAtEpochMs)}` : ''}</dd></div>
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
      <button type="button" onClick={() => openRadar(nextFlight, info)}><Pencil aria-hidden="true"/> Abrir Radar e informar dados</button>
    </div>}
  </section>;
}
