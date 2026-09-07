import assert from 'node:assert/strict';
import {
  buildArriveByOtpRequest,
  buildPresentationTarget,
  chooseInTripRescueRecommendation,
  choosePresentationRecommendation,
  rankPresentationRoutes,
} from '../server/mobility/presentationSyncPlanner.mjs';

const presentationAt = '2026-09-05T12:45:00-03:00';
const target = buildPresentationTarget({ presentationAt, arrivalBufferMinutes: 20 });
assert.equal(target.latestAirportArrivalAt, '2026-09-05T15:25:00.000Z');

const transit = [
  {
    id: 'bus-metro',
    start: '2026-09-05T13:35:00.000Z',
    end: '2026-09-05T15:05:00.000Z',
    realtimeAgeSeconds: 45,
    legs: [
      { mode: 'WALK' },
      { mode: 'BUS', waitSeconds: 120 },
      { mode: 'SUBWAY', waitSeconds: 90 },
      { mode: 'WALK' },
    ],
  },
  {
    id: 'bus-only',
    start: '2026-09-05T13:20:00.000Z',
    end: '2026-09-05T15:18:00.000Z',
    realtimeAgeSeconds: 40,
    legs: [{ mode: 'BUS', waitSeconds: 600 }],
  },
];

const ranked = rankPresentationRoutes({ itineraries: transit, presentationAt, arrivalBufferMinutes: 20 });
assert.equal(ranked[0].id, 'bus-metro');
assert.equal(ranked[0].eligible, true);
assert.deepEqual(ranked[0].transitModes, ['BUS', 'SUBWAY']);
assert.equal(ranked[0].transfers, 1);

const recTransit = choosePresentationRecommendation({
  transitItineraries: transit,
  drivingItinerary: {
    id: 'car',
    start: '2026-09-05T13:45:00.000Z',
    end: '2026-09-05T15:20:00.000Z',
    realtimeAgeSeconds: 500,
  },
  presentationAt,
  arrivalBufferMinutes: 20,
});
assert.equal(recTransit.recommendation, 'TRANSIT');
assert.equal(recTransit.primary.id, 'bus-metro');

const recDriving = choosePresentationRecommendation({
  transitItineraries: [{
    id: 'slow-transit',
    start: '2026-09-05T13:00:00.000Z',
    end: '2026-09-05T15:24:00.000Z',
    realtimeAgeSeconds: 400,
    legs: [{ mode: 'BUS', waitSeconds: 900 }, { mode: 'SUBWAY', waitSeconds: 600 }],
  }],
  drivingItinerary: {
    id: 'car-fast',
    start: '2026-09-05T14:25:00.000Z',
    end: '2026-09-05T15:05:00.000Z',
    realtimeAgeSeconds: 30,
  },
  presentationAt,
  arrivalBufferMinutes: 20,
});
assert.equal(recDriving.recommendation, 'DRIVING');
assert.equal(recDriving.primary.id, 'car-fast');

const rescueToTransit = chooseInTripRescueRecommendation({
  activeItinerary: {
    id: 'uber-congested',
    start: '2026-09-05T14:00:00.000Z',
    end: '2026-09-05T15:34:00.000Z',
    realtimeAgeSeconds: 20,
    legs: [{ mode: 'CAR' }],
  },
  alternatives: [{
    id: 'uber-metro-rescue',
    start: '2026-09-05T14:00:00.000Z',
    end: '2026-09-05T15:10:00.000Z',
    realtimeAgeSeconds: 20,
    legs: [{ mode: 'CAR' }, { mode: 'SUBWAY', waitSeconds: 120 }, { mode: 'WALK' }],
  }],
  presentationAt,
  arrivalBufferMinutes: 20,
});
assert.equal(rescueToTransit.action, 'SWITCH_NOW');
assert.equal(rescueToTransit.to.id, 'uber-metro-rescue');

const rescueToCar = chooseInTripRescueRecommendation({
  activeItinerary: {
    id: 'metro-disrupted',
    start: '2026-09-05T14:00:00.000Z',
    end: '2026-09-05T15:08:00.000Z',
    realtimeAgeSeconds: 15,
    disrupted: true,
    legs: [{ mode: 'SUBWAY', waitSeconds: 60 }],
  },
  alternatives: [{
    id: 'car-rescue',
    start: '2026-09-05T14:02:00.000Z',
    end: '2026-09-05T15:12:00.000Z',
    realtimeAgeSeconds: 15,
    legs: [{ mode: 'CAR' }],
  }],
  presentationAt,
  arrivalBufferMinutes: 20,
});
assert.equal(rescueToCar.action, 'SWITCH_NOW');
assert.equal(rescueToCar.to.id, 'car-rescue');

const keepRoute = chooseInTripRescueRecommendation({
  activeItinerary: {
    id: 'metro-ok',
    start: '2026-09-05T14:00:00.000Z',
    end: '2026-09-05T15:05:00.000Z',
    realtimeAgeSeconds: 20,
    legs: [{ mode: 'SUBWAY', waitSeconds: 60 }],
  },
  alternatives: [{
    id: 'car-similar',
    start: '2026-09-05T14:03:00.000Z',
    end: '2026-09-05T15:06:00.000Z',
    realtimeAgeSeconds: 20,
    legs: [{ mode: 'CAR' }],
  }],
  presentationAt,
  arrivalBufferMinutes: 20,
});
assert.equal(keepRoute.action, 'KEEP_ROUTE');

const otp = buildArriveByOtpRequest({
  origin: { lat: -15.8, lon: -47.9 },
  destination: { lat: -15.869, lon: -47.918 },
  presentationAt,
  arrivalBufferMinutes: 20,
});
assert.equal(otp.latestArrival, '2026-09-05T15:25:00.000Z');
assert.deepEqual(otp.transitModes, ['BUS', 'RAIL', 'SUBWAY']);

console.log('Mobility presentation sync planner regression OK');
