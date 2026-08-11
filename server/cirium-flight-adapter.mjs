function firstKnown(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim()) || '';
}

function timeValue(value) {
  return value && typeof value === 'object' ? firstKnown(value.dateUtc, value.dateLocal) : '';
}

const STATUS_LABELS = {
  A: 'Em voo', C: 'Cancelado', D: 'Desviado', L: 'Pousado', NO: 'Não operacional',
  R: 'Redirecionado', S: 'Programado', U: 'Desconhecido',
};

export function normalizeCiriumFlightStatus(row = {}, context = {}) {
  const times = row.operationalTimes || {};
  const resources = row.airportResources || {};
  const flight = `${row.carrierFsCode || context.carrier || ''}${row.flightNumber || context.flightNumber || ''}`.toUpperCase();
  const origin = firstKnown(row.departureAirportFsCode, context.origin);
  const destination = firstKnown(row.arrivalAirportFsCode, context.destination);
  const cancelled = row.status === 'C';
  return {
    ok: Boolean(flight && origin && destination),
    configured: true,
    provider: 'cirium-flightstats',
    flight,
    status: firstKnown(STATUS_LABELS[row.status], row.status, 'Monitorando'),
    statusProvided: Boolean(row.status),
    gate: firstKnown(resources.departureGate),
    terminal: firstKnown(resources.departureTerminal),
    departure: firstKnown(
      timeValue(times.actualGateDeparture), timeValue(times.estimatedGateDeparture),
      timeValue(times.scheduledGateDeparture), timeValue(times.publishedDeparture),
    ),
    arrival: firstKnown(
      timeValue(times.actualGateArrival), timeValue(times.estimatedGateArrival),
      timeValue(times.scheduledGateArrival), timeValue(times.publishedArrival),
    ),
    origin,
    destination,
    aircraft: firstKnown(row.flightEquipment?.scheduledEquipment?.iata, row.flightEquipment?.actualEquipment?.iata),
    registration: firstKnown(row.flightEquipment?.tailNumber),
    cancelled,
    updatedAt: firstKnown(row.lastUpdatedDate, row.statusDetails?.updatedAt),
    sourceFlightId: Number(row.flightId) || null,
    message: 'Dados Cirium normalizados em laboratório.',
  };
}

export function ciriumCoverage(item = {}) {
  const fields = ['status', 'gate', 'terminal', 'departure', 'arrival', 'origin', 'destination', 'aircraft', 'registration', 'updatedAt'];
  const present = Object.fromEntries(fields.map((field) => [field, field === 'status' ? Boolean(item.statusProvided) : Boolean(item[field])]));
  const count = Object.values(present).filter(Boolean).length;
  return { present, fields: fields.length, populated: count, percent: Math.round((count / fields.length) * 100) };
}
