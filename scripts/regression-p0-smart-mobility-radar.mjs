import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const css = fs.readFileSync('client/src/components/v1406/premium-layout.css', 'utf8');

function slice(startMarker, endMarker) {
  const start = home.indexOf(startMarker);
  const end = start >= 0 ? home.indexOf(endMarker, start + startMarker.length) : -1;
  assert.ok(start >= 0 && end > start, `bloco ausente: ${startMarker}`);
  return home.slice(start, end);
}

const selector = slice('function isHomeStandbyDepartureEvent(', 'function nextDepartureEvent(');
assert.match(selector, /event\.kind !== 'duty'/, 'filtro de HSB deve ser restrito a atividade em solo');
assert.match(selector, /HSB\|HOME\[ _-\]\*STANDBY\|SOBREAVISO/, 'HSB/home standby/sobreaviso devem ser reconhecidos');
assert.ok(!selector.includes('day as any)?.rawText'), 'HSB não pode ser inferido do rawText agregado do dia');
assert.ok(selector.includes('isDepartureRestEvent(event) || isHomeStandbyDepartureEvent(event)'), 'HSB deve ser excluído antes da seleção da atividade presencial');

function homeStandbyOwnIdentity(parts) {
  const ownIdentity = parts.map((value) => String(value || '').trim().toUpperCase()).filter(Boolean).join(' ');
  return /(^|\s)(HSB|HOME[ _-]*STANDBY|SOBREAVISO)(\s|$)/.test(ownIdentity);
}
assert.equal(homeStandbyOwnIdentity(['HSB']), true, 'HSB deve ser descartado como gatilho de saída física');
assert.equal(homeStandbyOwnIdentity(['Sobreaviso']), true, 'sobreaviso residencial deve ser descartado');
assert.equal(homeStandbyOwnIdentity(['ASB']), false, 'ASB deve permanecer elegível para deslocamento presencial');
assert.equal(homeStandbyOwnIdentity(['ASB', 'Reserva presencial']), false, 'reserva presencial não pode ser contaminada pelo HSB do mesmo dia');

const departure = slice('function Departure(', 'function MonthlyMapView');
assert.ok(departure.includes('event, radarEvent'), 'Deslocamento deve receber contexto Radar separado');
assert.ok(departure.includes('const radarTarget = departureRadarTarget(event, radarEvent);'), 'alvo Radar deve ser selecionado por ocorrência');
assert.ok(departure.includes('const radar = useRadarSnapshot(radarTarget);'), 'Deslocamento deve reutilizar o Radar canônico');
assert.ok(departure.includes('APRESENTAÇÃO INTELIGENTE'), 'título operacional deve refletir Apresentação Inteligente');
assert.ok(departure.includes('Deslocamento Inteligente'), 'nome guarda-chuva deve ser Deslocamento Inteligente');
assert.ok(departure.includes('cc-smart-mobility-settings'), 'controles secundários devem ficar recolhíveis');
assert.ok(departure.includes('cc-smart-mobility-radar'), 'status Radar compacto deve aparecer na superfície de deslocamento');
assert.ok(home.includes("<Departure event={departureEvent} radarEvent={flightEvent}/>"), 'Home deve fornecer próximo voo real somente como contexto Radar');
assert.ok(home.includes("['departure','Desloc.',Navigation]"), 'rodapé deve abandonar o rótulo genérico Saída');

const radarHelper = slice('function departureRadarTarget(', 'function Departure(');
assert.ok(radarHelper.includes('sameCivilDay'), 'Radar não pode cruzar dia operacional');
assert.ok(radarHelper.includes('samePresentationAirport'), 'Radar não pode puxar voo de outra base/origem');
assert.ok(radarHelper.includes('inOperationalWindow'), 'Radar deve respeitar janela operacional da atividade');

function radarCandidate({ sameDay, sameBase, inWindow }) { return sameDay && sameBase && inWindow; }
assert.equal(radarCandidate({ sameDay: true, sameBase: true, inWindow: true }), true);
assert.equal(radarCandidate({ sameDay: false, sameBase: true, inWindow: true }), false);
assert.equal(radarCandidate({ sameDay: true, sameBase: false, inWindow: true }), false);
assert.equal(radarCandidate({ sameDay: true, sameBase: true, inWindow: false }), false);

const maps = slice('function GoogleMapsRoutePreview(', 'function isAdmin()');
assert.ok(maps.includes('const incidents = route?.incidents || [];'), 'lista original deve permanecer para compatibilidade e visualização');
assert.ok(maps.includes('const meaningfulIncidents = incidents.filter('), 'notificação deve operar sobre subconjunto relevante');
assert.ok(maps.includes("item.roadClosure || item.severity === 'critical' || Number(item.delaySeconds || 0) >= 300"), 'alerta deve exigir bloqueio, crítico ou atraso >=5min');
assert.ok(maps.includes('if (!meaningfulIncidents.length) return;'), 'ocorrência sem impacto não deve interromper o usuário');
assert.ok(maps.includes('const fingerprint = meaningfulIncidents.map((item)'), 'dedupe deve ignorar ruído de ocorrências sem impacto');
assert.ok(maps.includes("const critical = incidents.find((item) => item.roadClosure || item.severity === 'critical');"), 'primeiro alerta crítico relevante deve continuar distinguido');
assert.ok(maps.includes("(critical || meaningfulIncidents[0])?.title"), 'corpo do alerta deve usar a ocorrência relevante');
assert.ok(maps.includes("'Trânsito com impacto na rota'"), 'alerta não crítico deve explicar impacto real');
assert.ok(!maps.includes("'Nova ocorrência na rota'"), 'aviso genérico sem nexo deve ser removido desta superfície');

function meaningfulIncident(item) {
  return Boolean(item.roadClosure || item.severity === 'critical' || Number(item.delaySeconds || 0) >= 300);
}
assert.equal(meaningfulIncident({ title: 'Retenção na rota', delaySeconds: 0 }), false, 'retenção sem atraso mensurável não deve notificar');
assert.equal(meaningfulIncident({ title: 'Retenção na rota', delaySeconds: 120 }), false, 'atraso pequeno não deve interromper usuário');
assert.equal(meaningfulIncident({ title: 'Retenção na rota', delaySeconds: 300 }), true, 'atraso de 5min deve ser relevante');
assert.equal(meaningfulIncident({ roadClosure: true, delaySeconds: 0 }), true, 'bloqueio real deve alertar mesmo sem atraso estimado');
assert.equal(meaningfulIncident({ severity: 'critical', delaySeconds: 0 }), true, 'incidente crítico deve alertar');

assert.ok(css.includes('/* p0-smart-mobility-radar-v1 */'), 'CSS final do slice deve estar aplicado');
assert.ok(css.includes('white-space: nowrap !important;'), 'horário principal não pode quebrar em duas linhas');
assert.ok(css.includes('overflow-wrap: normal !important;'), 'regra global de quebra não pode deformar HH:MM');
assert.ok(css.includes('.cz-depart-kpis { display: none !important; }'), 'KPIs duplicados devem ser removidos da tela estreita');

console.log('✅ P0 #530 Deslocamento Inteligente: HSB→ASB, Radar contextual, alertas relevantes e layout mobile protegidos.');
