function toMs(value, name) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`${name}_INVALID_DATETIME`);
  return ms;
}

function assertNumber(value, name, min = 0) {
  if (!Number.isFinite(value) || value < min) throw new Error(`${name}_INVALID`);
  return value;
}

function waitPenaltySeconds(itinerary) {
  return (itinerary.legs || []).reduce((total, leg) => {
    const wait = Number(leg.waitSeconds || 0);
    return total + (Number.isFinite(wait) && wait > 0 ? wait : 0);
  }, 0);
}

function transferCount(itinerary) {
  const transitLegs = (itinerary.legs || []).filter((leg) => ['BUS', 'RAIL', 'SUBWAY', 'TRAM'].includes(leg.mode));
  return Math.max(0, transitLegs.length - 1);
}

function transitModes(itinerary) {
  return [...new Set((itinerary.legs || []).map((leg) => leg.mode).filter((mode) => ['BUS', 'RAIL', 'SUBWAY', 'TRAM'].includes(mode)))];
}

export function buildPresentationTarget({ presentationAt, arrivalBufferMinutes = 20 }) {
  const presentationMs = toMs(presentationAt, 'PRESENTATION_AT');
  assertNumber(arrivalBufferMinutes, 'ARRIVAL_BUFFER_MINUTES');
  return {
    presentationAt: new Date(presentationMs).toISOString(),
    latestAirportArrivalAt: new Date(presentationMs - arrivalBufferMinutes * 60_000).toISOString(),
    arrivalBufferMinutes,
  };
}

export function rankPresentationRoutes({
  itineraries,
  presentationAt,
  arrivalBufferMinutes = 20,
  maxTransfers = 3,
  realtimeFreshnessSeconds = 180,
}) {
  if (!Array.isArray(itineraries)) throw new Error('ITINERARIES_REQUIRED');
  const target = buildPresentationTarget({ presentationAt, arrivalBufferMinutes });
  const latestArrivalMs = toMs(target.latestAirportArrivalAt, 'LATEST_AIRPORT_ARRIVAL_AT');

  return itineraries.map((itinerary) => {
    const startMs = toMs(itinerary.start, 'ITINERARY_START');
    const endMs = toMs(itinerary.end, 'ITINERARY_END');
    const durationSeconds = Math.max(0, Math.round((endMs - startMs) / 1000));
    const waitSeconds = waitPenaltySeconds(itinerary);
    const transfers = transferCount(itinerary);
    const marginSeconds = Math.round((latestArrivalMs - endMs) / 1000);
    const realtimeAgeSeconds = Number.isFinite(itinerary.realtimeAgeSeconds) ? Math.max(0, itinerary.realtimeAgeSeconds) : null;
    const realtimeFresh = realtimeAgeSeconds === null ? false : realtimeAgeSeconds <= realtimeFreshnessSeconds;
    const eligible = marginSeconds >= 0 && transfers <= maxTransfers;
    const reliabilityPenalty = realtimeFresh ? 0 : 600;
    const transferPenalty = transfers * 300;
    const waitPenalty = Math.round(waitSeconds * 0.8);
    const score = durationSeconds + reliabilityPenalty + transferPenalty + waitPenalty - Math.min(Math.max(marginSeconds, 0), 1800) * 0.15;

    return {
      ...itinerary,
      durationSeconds,
      waitSeconds,
      transfers,
      transitModes: transitModes(itinerary),
      marginSeconds,
      realtimeFresh,
      eligible,
      score,
    };
  }).sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return a.score - b.score;
  });
}

export function choosePresentationRecommendation({
  transitItineraries = [],
  drivingItinerary = null,
  presentationAt,
  arrivalBufferMinutes = 20,
}) {
  const rankedTransit = rankPresentationRoutes({
    itineraries: transitItineraries,
    presentationAt,
    arrivalBufferMinutes,
  });
  const bestTransit = rankedTransit.find((route) => route.eligible) || null;

  let bestDriving = null;
  if (drivingItinerary) {
    bestDriving = rankPresentationRoutes({
      itineraries: [{ ...drivingItinerary, legs: drivingItinerary.legs || [{ mode: 'CAR' }] }],
      presentationAt,
      arrivalBufferMinutes,
      maxTransfers: 0,
    })[0];
  }

  if (!bestTransit && !bestDriving?.eligible) {
    return {
      recommendation: 'NO_SAFE_ROUTE',
      primary: null,
      reason: 'Nenhuma rota conhecida preserva a margem de apresentação.',
      rankedTransit,
      driving: bestDriving,
    };
  }

  if (bestTransit && (!bestDriving?.eligible || bestTransit.score <= bestDriving.score)) {
    return {
      recommendation: 'TRANSIT',
      primary: bestTransit,
      reason: bestTransit.transitModes.length > 1
        ? 'Ônibus + metrô é a melhor combinação conhecida para chegar com margem e reduzir espera.'
        : 'Transporte público é a melhor opção conhecida para chegar com margem.',
      rankedTransit,
      driving: bestDriving,
    };
  }

  return {
    recommendation: 'DRIVING',
    primary: bestDriving,
    reason: 'Hoje o deslocamento rodoviário é mais rápido ou mais confiável para preservar sua apresentação.',
    rankedTransit,
    driving: bestDriving,
  };
}

export function buildArriveByOtpRequest({ origin, destination, presentationAt, arrivalBufferMinutes = 20 }) {
  const target = buildPresentationTarget({ presentationAt, arrivalBufferMinutes });
  return {
    origin,
    destination,
    latestArrival: target.latestAirportArrivalAt,
    directModes: ['WALK'],
    transitModes: ['BUS', 'RAIL', 'SUBWAY'],
    first: 8,
  };
}
