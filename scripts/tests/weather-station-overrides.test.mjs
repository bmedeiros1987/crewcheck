import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewedWeatherStation } from '../../shared/weather-station-overrides.mjs';
test('only the reviewed BPS override is supplied; other maps retain their own fallbacks', () => {
  for (const code of ['BPS', 'bps', ' BPS ']) assert.equal(reviewedWeatherStation(code), 'SBPS');
  for (const code of ['SBPS', 'BSB', 'OPS', 'CPV', 'XXX', '', null, undefined, 0]) assert.equal(reviewedWeatherStation(code), null);
});
