import fs from 'node:fs';
function update(file, transform) { const before = fs.readFileSync(file, 'utf8'); const after = transform(before); if (after !== before) fs.writeFileSync(file, after); }
function replace(s, from, to) { if (s.includes(to)) return s; if (!s.includes(from)) throw new Error(`Incident association anchor missing: ${from.slice(0,90)}`); return s.replace(from,to); }
update('server.mjs', s => {
 if (!s.includes("from './shared/routeIncidentAssociation.mjs'")) s = "import { hasConfirmedRouteClosure, incidentHeading, prioritizeIncidents } from './shared/routeIncidentAssociation.mjs';\n" + s;
 s=replace(s,'  return sections.slice(0, 12).map((section, index) => {','  return prioritizeIncidents(sections.map((section, index) => {');
 s=replace(s,'      endPointIndex: Number(section.endPointIndex || 0),\n    };\n  });','      endPointIndex: Number(section.endPointIndex || 0),\n    };\n  })).slice(0, 12);');
 s=replace(s,'const incidents = [...new Map([...detailedEvents, ...routeEvents].map((incident) => [incident.id || `${incident.category}:${incident.title}`, incident])).values()].slice(0, 12);','const incidents = prioritizeIncidents([...new Map([...detailedEvents, ...routeEvents].map((incident) => [incident.id || `${incident.category}:${incident.title}`, incident])).values()]).slice(0, 12);');
 s=replace(s,"      startPointIndex: Number(section.startPointIndex || 0),","      association: 'on_route',\n      source: 'tomtom_route_section',\n      observedAt: new Date().toISOString(),\n      startPointIndex: Number(section.startPointIndex || 0),");
 s=replace(s,'      category: meta.category,','      association: \'near_route\',\n      source: \'tomtom_incident_details\',\n      observedAt: new Date(now).toISOString(),\n      category: meta.category,');
 s=replace(s,'      title: description || meta.title,',"      title: description || meta.title.replace(' na rota', ''),");
 s=replace(s,'hasRoadClosure: incidents.some((incident) => incident.roadClosure),','hasRoadClosure: hasConfirmedRouteClosure(incidents),');
 s=replace(s,"message: incidents.length ? 'Trânsito ao vivo atualizado; há ocorrências no trajeto.' : 'Trânsito ao vivo atualizado pela TomTom.',","message: incidents.length ? incidentHeading(incidents) : 'Trânsito ao vivo atualizado pela TomTom.',");
 return s;
});
update('client/src/pages/Home.tsx', s=>{
 if(!s.includes("from '../../../shared/routeIncidentAssociation.mjs'")) s="import { hasConfirmedRouteClosure, incidentHeading, incidentDetail, prioritizeIncidents } from '../../../shared/routeIncidentAssociation.mjs';\n"+s;
 s=replace(s,'incidents?: Array<{ id?: string;',"incidents?: Array<{ association?: 'on_route' | 'near_route'; source?: string; observedAt?: string; lastReportTime?: string; id?: string;");
 if (s.includes('JSON.stringify([item.id || item.title, item.category,')) {
  s=replace(s,'JSON.stringify([item.id || item.title, item.category, item.severity, Boolean(item.roadClosure)])','JSON.stringify([item.id || item.title, item.category, item.association, item.severity, Boolean(item.roadClosure)])');
 } else {
 s=replace(s,'${item.id || item.title}:${item.severity}:${item.delaySeconds || 0}','${item.id || item.title}:${item.association || \'unknown\'}:${item.severity}:${item.delaySeconds || 0}');
 }
 s=replace(s,"const title = critical ? 'Bloqueio ou ocorrência crítica na rota' : 'Nova ocorrência na rota';","const title = incidentHeading(incidents);");
 s=replace(s,"const body = (critical || incidents[0])?.title || 'Revise o trajeto antes de sair.';","const body = incidentDetail(critical || incidents[0]);");
 s=replace(s,"${route.hasRoadClosure ? 'critical' : ''}","${hasConfirmedRouteClosure(route.incidents) ? 'critical' : ''}");
 s=replace(s,"{route.hasRoadClosure ? 'Bloqueio detectado no trajeto' : `${route.incidents.length} ocorrência(s) no trajeto`}","{incidentHeading(route.incidents)}");
 s=replace(s,'route.incidents.slice(0, 3).map','prioritizeIncidents(route.incidents).slice(0, 3).map');
 s=replace(s,'{incident.title}{incident.delayText ? ` · ${incident.delayText}` : \'\'}','{incidentDetail(incident)}');
 return s;
});
update('server/telegram-fast-ack.mjs',s=>{
 if(!s.includes("from '../shared/routeIncidentAssociation.mjs'")) s="import { hasConfirmedRouteClosure, incidentHeading, incidentDetail, prioritizeIncidents } from '../shared/routeIncidentAssociation.mjs';\n"+s;
 s=replace(s,'const incidents = (Array.isArray(route.incidents) ? route.incidents : []).slice(0, 3);','const incidents = prioritizeIncidents(Array.isArray(route.incidents) ? route.incidents : []).slice(0, 3);');
 s=replace(s,'[item.id, item.category, item.severity, item.delaySeconds]','[item.id, item.category, item.association, item.severity, item.delaySeconds]');
 s=replace(s,"`• ${item.title || 'Ocorrência na rota'}${item.delayText ? ` · ${item.delayText}` : ''}`","`• ${incidentDetail(item)}`");
 s=replace(s,"reason === 'closure' ? '🚧 ALERTA DE BLOQUEIO NA ROTA' : reason === 'incident' ? '⚠️ NOVA OCORRÊNCIA NA ROTA' : '🚗 TRÂNSITO MUDOU'","reason === 'closure' || reason === 'incident' ? `⚠️ ${incidentHeading(route.incidents || [])}` : '🚗 TRÂNSITO MUDOU'");
 s=replace(s,'Boolean(route.hasRoadClosure || incidents.some((item) => item.roadClosure))','hasConfirmedRouteClosure(incidents)');
 return s;
});
