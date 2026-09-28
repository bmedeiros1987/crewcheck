function firstKnown(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim()) || '';
}

function timeValue(value) {
  return value && typeof value === 'object' ? firstKnown(value.dateUtc, value.dateLocal) : '';
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
    'departure', 'arrival', 'origin', 'destination', 'aircraft', 'registration', 'updatedAt',
  ];
  const present = Object.fromEntries(fields.map((field) => [field, field === 'status' ? Boolean(item.statusProvided) : Boolean(item[field])]));
  const count = Object.values(present).filter(Boolean).length;
  return { present, fields: fields.length, populated: count, percent: Math.round((count / fields.length) * 100) };
}
