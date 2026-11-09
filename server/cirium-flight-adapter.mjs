import {regulationOperationalInstant} from '../shared/regulationOperationalArrival.mjs';

const ARRIVAL_FIELDS={scheduledGateArrival:['SGA','scheduled','gate_in'],estimatedGateArrival:['EGA','estimated','gate_in'],actualGateArrival:['AGA','actual','gate_in'],scheduledRunwayArrival:['SRA','scheduled','landing'],estimatedRunwayArrival:['ERA','estimated','landing'],actualRunwayArrival:['ARA','actual','landing']};
// FlightStatusUpdate.updatedAt proves only the date fields named in that delta.
// A later removal/different value must invalidate an older matching observation.
export function normalizeCiriumArrivalMilestones(row={}){
 const updates=row.flightStatusUpdates;
 return Object.fromEntries(Object.entries(ARRIVAL_FIELDS).map(([name,[code,kind,milestone]])=>{
  const value=regulationOperationalInstant(row.operationalTimes?.[name]?.dateUtc);
  let latest=null,conflict=false,invalid=false;
  if(Array.isArray(updates)&&updates.length<=500)for(const update of updates){
   if(update?.updatedDateFields===undefined)continue;
   if(!Array.isArray(update?.updatedDateFields)||update.updatedDateFields.length>100){invalid=true;continue;}
   for(const change of update.updatedDateFields){
    if(change?.field!==code)continue;
    const stamp=regulationOperationalInstant(update.updatedAt?.dateUtc),changed=regulationOperationalInstant(change.newDateUtc);
    if(stamp===null){invalid=true;continue;}
    if(!latest||stamp>latest.stamp){latest={stamp,changed};conflict=false;}
    else if(stamp===latest.stamp&&changed!==latest.changed)conflict=true;
   }
  }
  const observedAt=value!==null&&!invalid&&!conflict&&latest?.changed===value?new Date(latest.stamp).toISOString():null;
  return [name,{at:value===null?null:new Date(value).toISOString(),kind,milestone,sourceField:code,observedAt}];
 }));
}

function firstKnown(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim()) || '';
}

function timeValue(value) {
  return value && typeof value === 'object' ? firstKnown(value.dateUtc, value.dateLocal) : '';
}

function finiteNumber(value) {
  // Only real numbers and non-empty numeric strings count. A missing provider
  // value must stay null: displaying it as 0 would assert a measured delay or
  // duration that the provider never reported.
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

const STATUS_LABELS = {
  A: 'Em voo', C: 'Cancelado', D: 'Desviado', L: 'Pousado', NO: 'Não operacional',
  R: 'Redirecionado', S: 'Programado', U: 'Desconhecido',
};

export function normalizeCiriumFlightStatus(row = {}, context = {}) {
  const times = row.operationalTimes || {};
  const resources = row.airportResources || {};
  const equipment = row.flightEquipment || {};
  const delays = row.delays || {};
  const durations = row.flightDurations || {};
  const flight = `${row.carrierFsCode || context.carrier || ''}${row.flightNumber || context.flightNumber || ''}`.toUpperCase();
  const origin = firstKnown(row.departureAirportFsCode, context.origin);
  const destination = firstKnown(row.arrivalAirportFsCode, context.destination);
  const cancelled = row.status === 'C';
  const aircraft = firstKnown(
    equipment.actualEquipmentIataCode,
    equipment.actualEquipment?.iata,
    equipment.scheduledEquipmentIataCode,
    equipment.scheduledEquipment?.iata,
  );
  const scheduledAircraft = firstKnown(equipment.scheduledEquipmentIataCode, equipment.scheduledEquipment?.iata);
  const actualAircraft = firstKnown(equipment.actualEquipmentIataCode, equipment.actualEquipment?.iata);
  const codeshares = Array.isArray(row.codeshares)
    ? row.codeshares.slice(0, 12).map((item) => ({
      carrier: String(item?.fsCode || '').trim().toUpperCase(),
      flightNumber: String(item?.flightNumber || '').trim().toUpperCase(),
      relationship: String(item?.relationship || '').trim().toUpperCase(),
    })).filter((item) => item.carrier && item.flightNumber)
    : [];
  const irregularOperations = Array.isArray(row.irregularOperations)
    ? row.irregularOperations.slice(0, 10).map((item) => ({
      type: String(item?.type || item?.typeCode || '').trim().slice(0, 80),
      reason: String(item?.reason || item?.reasonCode || '').trim().slice(0, 120),
    }))
    : [];

  return {
    ok: Boolean(flight && origin && destination),
    configured: true,
    provider: 'cirium-sky',
    statusCode: typeof row.status==='string'?row.status:'',
    flight,
    status: firstKnown(STATUS_LABELS[row.status], row.status, 'Monitorando'),
    statusProvided: Boolean(row.status),
    gate: firstKnown(resources.departureGate),
    terminal: firstKnown(resources.departureTerminal),
    arrivalGate: firstKnown(resources.arrivalGate),
    arrivalTerminal: firstKnown(resources.arrivalTerminal),
    baggage: firstKnown(resources.baggage),
    departure: firstKnown(
      timeValue(times.actualGateDeparture), timeValue(times.actualRunwayDeparture),
      timeValue(times.estimatedGateDeparture), timeValue(times.estimatedRunwayDeparture),
      timeValue(times.scheduledGateDeparture), timeValue(times.publishedDeparture),
    ),
    arrival: firstKnown(
      timeValue(times.actualGateArrival), timeValue(times.actualRunwayArrival),
      timeValue(times.estimatedGateArrival), timeValue(times.estimatedRunwayArrival),
      timeValue(times.scheduledGateArrival), timeValue(times.publishedArrival),
    ),
    arrivalMilestones: normalizeCiriumArrivalMilestones(row),
    scheduledDeparture: firstKnown(timeValue(times.scheduledGateDeparture), timeValue(times.publishedDeparture)),
    estimatedDeparture: firstKnown(timeValue(times.estimatedGateDeparture), timeValue(times.estimatedRunwayDeparture)),
    actualDeparture: firstKnown(timeValue(times.actualGateDeparture), timeValue(times.actualRunwayDeparture)),
    scheduledArrival: firstKnown(timeValue(times.scheduledGateArrival), timeValue(times.publishedArrival)),
    estimatedArrival: firstKnown(timeValue(times.estimatedGateArrival), timeValue(times.estimatedRunwayArrival)),
    actualArrival: firstKnown(timeValue(times.actualGateArrival), timeValue(times.actualRunwayArrival)),
    origin,
    destination,
    aircraft,
    scheduledAircraft,
    actualAircraft,
    registration: firstKnown(equipment.tailNumber),
    delays: {
      departureGateMinutes: finiteNumber(delays.departureGateDelayMinutes),
      departureRunwayMinutes: finiteNumber(delays.departureRunwayDelayMinutes),
      arrivalGateMinutes: finiteNumber(delays.arrivalGateDelayMinutes),
      arrivalRunwayMinutes: finiteNumber(delays.arrivalRunwayDelayMinutes),
    },
    durations: {
      scheduledBlockMinutes: finiteNumber(durations.scheduledBlockMinutes),
      blockMinutes: finiteNumber(durations.blockMinutes),
      scheduledAirMinutes: finiteNumber(durations.scheduledAirMinutes),
      airMinutes: finiteNumber(durations.airMinutes),
      taxiOutMinutes: finiteNumber(durations.taxiOutMinutes),
      taxiInMinutes: finiteNumber(durations.taxiInMinutes),
    },
    codeshares,
    irregularOperations,
    cancelled,
    updatedAt: firstKnown(row.lastUpdatedDate, row.statusDetails?.updatedAt),
    sourceFlightId: Number(row.flightId) || null,
    message: 'Dados Cirium normalizados em laboratório.',
  };
}

export function ciriumCoverage(item = {}) {
  const fields = [
    'status', 'gate', 'terminal', 'arrivalGate', 'arrivalTerminal', 'baggage',
    'departure', 'arrival', 'origin', 'destination', 'aircraft', 'registration', 'updatedAt', 'delays',
  ];
  const present = Object.fromEntries(fields.map((field) => {
    if (field === 'status') return [field, Boolean(item.statusProvided)];
    if (field === 'delays') {
      return [field, Object.values(item.delays || {}).some((value) => typeof value === 'number')];
    }
    return [field, Boolean(item[field])];
  }));
  const count = Object.values(present).filter(Boolean).length;
  return { present, fields: fields.length, populated: count, percent: Math.round((count / fields.length) * 100) };
}
