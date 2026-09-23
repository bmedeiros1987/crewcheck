import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const component=await readFile('client/src/components/tv/TvDeviceControl.tsx','utf8');
const home=await readFile('client/src/pages/Home.tsx','utf8');

for(const route of ['/api/tv/devices','/api/tv/preferences','/api/tv/context','/api/tv/revoke'])
  assert.ok(component.includes(route),route);

assert.match(component,/audience:'owner'/);
assert.match(component,/value==='visitor'/);
assert.match(component,/Visitante: linguagem simples/);
assert.match(component,/current\.audience!=='owner'/);
assert.match(component,/\['hotel','crew','finance','mobility','traffic'\]/);
assert.match(component,/ttlMs:5\*60\*1000/);
assert.match(component,/ttlMs:10\*60\*1000/);
assert.match(component,/journeyDetails:Object\.fromEntries/);
assert.match(component,/VITE_TV_API_ORIGIN/);
assert.match(component,/navigator\.geolocation\.getCurrentPosition/);
assert.match(component,/Desvincular/);

assert.match(home,/import TvDeviceControl/);
assert.match(home,/<TvDeviceControl journeyFinance=\{journeyFinance\}\/>/);
assert.match(home,/function tvJourneyFinanceContext/);
assert.match(home,/event\.canonical\?\.journeyId/);
assert.match(home,/finance\.salary\.configured/);
assert.match(home,/finance\.perdiem\.convertedComplete/);
assert.match(home,/Estimativa calculada pelo CrewCheck Mobile/);
assert.match(home,/view === 'settings'[\s\S]{0,300}tvJourneyFinanceContext\(events, bundle\.roster\)/);

console.log('PASS: Mobile owns TV consent, visitor mode, temporary traffic/finance context and revocation.');
