/** Association is provider provenance, never an inference from geometry direction. */
export function isRouteIncident(item) {
  return item?.association === 'on_route' && item?.source === 'tomtom_route_section';
}
export function hasConfirmedRouteClosure(incidents = []) {
  return incidents.some(item => isRouteIncident(item) && item.roadClosure);
}
export function incidentHeading(incidents = []) {
  if (hasConfirmedRouteClosure(incidents)) return 'Bloqueio detectado no trajeto';
  if (incidents.some(isRouteIncident)) return incidents.every(isRouteIncident) ? 'Ocorrências no trajeto' : 'Ocorrências no trajeto e nas proximidades';
  return 'Ocorrências próximas · impacto no trajeto não confirmado';
}
export function incidentDetail(item) {
  const association = isRouteIncident(item) ? 'na rota calculada' : 'próximo ao trajeto · impacto no trajeto não confirmado';
  const source = item?.source === 'tomtom_route_section' ? 'TomTom · seção da rota' : item?.source === 'tomtom_incident_details' ? 'TomTom · ocorrência próxima' : 'Fonte não informada';
  const raw = item?.lastReportTime || item?.observedAt;
  const date = raw ? new Date(raw) : null;
  const time = date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date) + ' BRT' : 'horário não informado';
  const severity = item?.severity === 'critical' ? ' · gravidade crítica' : item?.severity === 'warning' ? ' · atenção' : '';
  return `${item?.title || 'Ocorrência'}${severity} · ${association}${item?.delayText ? ` · ${item.delayText}` : ''} · ${source} · ${item?.lastReportTime ? 'reportado' : 'consultado'} ${time}`;
}

export function prioritizeIncidents(incidents = []) {
  const rank = item => (isRouteIncident(item) ? 8 : 0) + (item.roadClosure ? 4 : 0) + (item.severity === 'critical' ? 2 : item.severity === 'warning' ? 1 : 0);
  return [...incidents].sort((a,b) => rank(b) - rank(a));
}
