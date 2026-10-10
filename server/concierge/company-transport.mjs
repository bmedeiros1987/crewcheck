import { companyTransportPresentation } from '../../shared/companyTransport.mjs';
import { companyTransportIntent, companyTransportFold as fold } from '../../shared/companyTransportIntent.mjs';
import { privateStayMenuOwner } from './stay-menu.mjs';

const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
const clock = seconds => `${String(Math.floor(seconds / 3600) % 24).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}${seconds >= 86400 ? ' (+1 dia)' : ''}`;
const validDate = value => { try { return /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value; } catch { return false; } };
const verification = 'Horários previstos de referência; confirme atualização, exceções, acesso e reserva com a empresa. Funcionamento em tempo real não confirmado. Não calculo chegada nem viabilidade da apresentação sem os tempos dos demais trechos.';

export function companyTransportOwner(profile = {}) {
  if (profile?.visitor === true || /^(?:visitor|visitante|guest)$/i.test(String(profile?.role || ''))) return '';
  if (!['app', 'telegram'].includes(profile?.channel)) return '';
  return privateStayMenuOwner(profile);
}

// No catalogue provider is installed here. The future server-owned adapter must
// prove owner, company and eligibility before returning any private references.
export async function companyTransportReply(text, profile = {}, deps = {}) {
  const intent = companyTransportIntent(text);
  if (!intent) return { handled: false };
  const answer = reply => ({ handled: true, reply });
  const owner = companyTransportOwner(profile);
  if (!owner) return answer('Ônibus e vans da empresa: consulte pelo app autenticado ou pela conversa privada vinculada ao CrewCheck. Tabelas corporativas não são exibidas a visitantes.');
  if (!intent.origin || !intent.destination) return answer('Qual é a origem e o destino do transporte da empresa? Informe também a data e, se souber, o ponto de embarque. Exemplo: “ônibus da empresa de origem para destino em AAAA-MM-DD”. Não uso sua localização para escolher o trajeto.');
  if (!validDate(intent.serviceDate)) return answer('Para qual data você quer os horários previstos? Informe AAAA-MM-DD junto com a origem e o destino. O sentido da viagem e o ponto de embarque precisam corresponder à referência.');
  if (typeof deps.readAuthorizedCatalogue !== 'function') return answer('O catálogo privado de transporte da empresa ainda não está habilitado para consulta no CrewCierge. A origem informada é o site da LATAM; acesso, elegibilidade e exceções precisam ser confirmados antes de disponibilizar a tabela. ' + verification);
  let catalogue;
  try { catalogue = await deps.readAuthorizedCatalogue(owner); }
  catch { return answer('Não consegui consultar a referência privada agora. Tente novamente; esta falha não significa ausência de transporte.'); }
  if (!catalogue || catalogue.ownerEmail !== owner || catalogue.accessScope !== 'private-company-transport' || catalogue.authorized !== true || catalogue.eligible !== true || !clean(catalogue.companyId) || !Array.isArray(catalogue.references)) return answer('Não há autorização confirmada para consultar esse catálogo corporativo nesta conta. Confirme o acesso e a elegibilidade com a empresa.');
  const candidates = [];
  for (const entry of catalogue.references) {
    if (!entry || entry.ownerEmail !== owner || entry.companyId !== catalogue.companyId || entry.accessScope !== 'private-company-transport' || entry.eligible !== true || !['bus','van'].includes(entry.vehicleType)) continue;
    const reference = entry.reference;
    if (!reference || reference.eligibility?.status !== 'confirmed' || !Array.isArray(reference.stops)) continue;
    if (intent.operator && fold(reference.operator) !== intent.operator) continue;
    const matches = (stop, label, point) => stop && [stop.id, stop.label].some(value => fold(value) === label) && (!point || fold(stop.boardingPoint) === point);
    for (const origin of reference.stops.filter(stop => matches(stop, intent.origin, intent.boardingPoint))) {
      for (const destination of reference.stops.filter(stop => matches(stop, intent.destination, intent.alightingPoint))) {
        const query = { referenceId: reference.id, serviceDate: intent.serviceDate, originStopId: origin.id, destinationStopId: destination.id };
        const result = companyTransportPresentation([reference], query);
        if (result.references.length) candidates.push({ reference: result.references[0], vehicleType: entry.vehicleType, origin, destination });
      }
    }
  }
  if (!candidates.length) return answer('Não encontrei uma referência autorizada para esse sentido e esses pontos. Confira a origem, o destino e o local de embarque; isso não confirma que o transporte não exista.');
  const matchingVehicles = intent.requestedVehicle ? candidates.filter(item => item.vehicleType === intent.requestedVehicle) : candidates;
  if (!matchingVehicles.length) return answer(`A referência desse trajeto descreve ${candidates[0].vehicleType === 'bus' ? 'ônibus' : 'van'}; ${intent.requestedVehicle === 'van' ? 'vans não estão confirmadas' : 'ônibus não estão confirmados'} por essa fonte. ` + verification);
  if (matchingVehicles.length > 1) return answer('Há mais de uma referência para esse trajeto. Qual é a operadora e o ponto de embarque/desembarque? Repita a consulta incluindo esses detalhes para escolher o sentido correto.');
  const { reference, vehicleType, origin, destination } = matchingVehicles[0];
  return answer([
    `${vehicleType === 'bus' ? 'Ônibus' : 'Van'} da empresa · horários previstos`,
    `${clean(reference.operator)} · ${clean(reference.direction)} · data ${reference.serviceDate} · fuso ${clean(reference.timeZone)}`,
    `Embarque: ${clean(origin.label)} · ${clean(origin.boardingPoint)}. Desembarque: ${clean(destination.label)} · ${clean(destination.boardingPoint)}.`,
    reference.outsideValidity ? 'Data fora da vigência da referência.' : !reference.calendarRuns ? 'Sem partidas previstas nessa data conforme o calendário da referência.' : reference.plannedTimes.length ? 'Partidas previstas: ' + reference.plannedTimes.slice(0, 60).map(time => clock(time.boardAtSeconds)).join(', ') : 'Partidas não informadas na referência.',
    `Fonte: ${clean(reference.provenance.label)} · publicação: ${clean(reference.provenance.publishedAt) || 'data não informada'}. Vigência: ${reference.validity.status === 'confirmed' ? `${reference.validity.from} a ${reference.validity.until}` : 'não confirmada'}.`,
    verification,
  ].join('\n\n'));
}
