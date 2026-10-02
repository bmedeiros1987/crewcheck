export type RouteIncidentAssociation = { association?: 'on_route' | 'near_route'; source?: string; observedAt?: string; lastReportTime?: string; severity?: string; roadClosure?: boolean; title?: string; delayText?: string };
export function isRouteIncident(item?: RouteIncidentAssociation): boolean;
export function hasConfirmedRouteClosure(incidents?: RouteIncidentAssociation[]): boolean;
export function incidentHeading(incidents?: RouteIncidentAssociation[]): string;
export function incidentDetail(item?: RouteIncidentAssociation): string;

export function prioritizeIncidents<T extends RouteIncidentAssociation>(incidents?: T[]): T[];
