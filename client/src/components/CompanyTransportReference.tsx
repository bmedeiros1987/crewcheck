import React from 'react';
import { companyTransportPresentation, type CompanyTransportReference as Reference, type CompanyTransportQuery } from '@shared/companyTransport.mjs';

const clock = (seconds: number) => `${String(Math.floor(seconds / 3600) % 24).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}${seconds >= 86400 ? ' (+1 dia)' : ''}`;
export default function CompanyTransportReference({ catalogue = [], query = {} }: { catalogue?: Reference[]; query?: CompanyTransportQuery }) {
  const presentation = companyTransportPresentation(catalogue, query);
  return <aside className="cz-mini-status" data-company-transport="unconfirmed" role="status">
    <strong>{presentation.label}</strong>
    <p>Ligação entre pontos atendidos. Confirme vigência, elegibilidade, reserva e funcionamento com a empresa. O trecho de casa até o embarque e a conexão até a apresentação precisam ser verificados.</p>
    {!presentation.references.length && <p>Horários de referência ainda não habilitados para este sentido e ponto de embarque.</p>}
    {presentation.references.map(reference => <details key={reference.id}>
      <summary>{reference.operator} · {reference.direction} · horários previstos</summary>
      <p>Fonte: {reference.provenance.label} · publicação: {reference.provenance.publishedAt || 'não informada'} · fuso: {reference.timeZone}</p>
      <p>Vigência: {reference.validity.status === 'confirmed' ? `${reference.validity.from} a ${reference.validity.until}` : 'não confirmada'} · elegibilidade: {reference.eligibility.description} ({reference.eligibility.status === 'confirmed' ? 'confirmada' : 'a confirmar'})</p>
      <p>Dias previstos: {reference.days.map(day => ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][day]).join(', ')}. Data do serviço: {reference.serviceDate}.</p>
      <p>{reference.stops.map(stop => `${stop.label}: ${stop.boardingPoint}`).join(' → ')}</p>
      {reference.exceptions.map(exception => <p key={exception.date}>{exception.date}: {exception.runs ? 'operação prevista' : 'sem operação prevista'} · {exception.note}</p>)}
      <p>{reference.outsideValidity ? 'Data fora da vigência da referência.' : !reference.calendarRuns ? 'Sem partidas previstas nesta data.' : reference.plannedTimes.length ? reference.plannedTimes.map(time => `${clock(time.boardAtSeconds)} → ${clock(time.alightAtSeconds)}`).join(' · ') : 'Partidas não informadas.'}</p>
      <small>Tabela de referência; funcionamento não confirmado. Horário de saída e duração do deslocamento permanecem a confirmar.</small>
    </details>)}
  </aside>;
}
