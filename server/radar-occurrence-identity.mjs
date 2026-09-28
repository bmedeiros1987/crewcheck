function upper(value = '') {
  return String(value || '').trim().toUpperCase();
}

function flightNumber(value = '') {
  return String(value || '').trim().replace(/\s+/g, '');
}

function localDate(value = '') {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || '';
}

function localTime(value = '') {
  const text = String(value || '').trim();
  const match = text.match(/T(\d{2}:\d{2})(?::\d{2})?/);
  return match?.[1] || '';
}

export function radarCarrierIdentity(input = {}, context = {}) {
  const marketing = upper(input.marketingCarrier || input.carrier || input.airlineCode);
  const operating = upper(input.operatingCarrier || input.operatorCarrier || input.operatingAirlineCode);
  const domesticRoster = context.source === 'roster' && context.operationCountry === 'BR';

  if (domesticRoster && [marketing, operating].some((code) => code === 'LA' || code === 'JJ')) {
    return 'LATAM_BR';
  }

  return marketing || operating;
}

export function radarOccurrenceIdentity(input = {}, context = {}) {
  const scheduled = String(input.scheduledDeparture || input.departure || '').trim();
  const date = localDate(input.departureDate || scheduled);
  const time = localTime(scheduled);

  return {
    carrierIdentity: radarCarrierIdentity(input, context),
    flightNumber: flightNumber(input.flightNumber || input.number),
    departureDate: date,
    origin: upper(input.origin || input.departureAirport),
    destination: upper(input.destination || input.arrivalAirport),
    scheduledDepartureTime: time,
  };
}

export function radarOccurrenceKey(input = {}, context = {}) {
  const identity = radarOccurrenceIdentity(input, context);
  return [
    identity.carrierIdentity,
    identity.flightNumber,
    identity.departureDate,
    identity.origin,
    identity.destination,
    identity.scheduledDepartureTime,
  ].join('|');
}

export function sameRadarOccurrence(a = {}, b = {}, context = {}) {
  const left = radarOccurrenceIdentity(a, context);
  const right = radarOccurrenceIdentity(b, context);

  if (!left.carrierIdentity || !left.flightNumber || !left.departureDate || !left.origin || !left.destination) return false;
  if (!right.carrierIdentity || !right.flightNumber || !right.departureDate || !right.origin || !right.destination) return false;

  if (left.carrierIdentity !== right.carrierIdentity) return false;
  if (left.flightNumber !== right.flightNumber) return false;
  if (left.departureDate !== right.departureDate) return false;
  if (left.origin !== right.origin || left.destination !== right.destination) return false;

  if (left.scheduledDepartureTime && right.scheduledDepartureTime) {
    return left.scheduledDepartureTime === right.scheduledDepartureTime;
  }

  return true;
}
