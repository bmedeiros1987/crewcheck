import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const home = await readFile('client/src/pages/Home.tsx', 'utf8');
const roster = await readFile('client/src/components/v1391/RosterLaunchView.tsx', 'utf8');

// Real #530 reproducer class:
// - device cache can contain an older publication (e.g. HSB on 21/09);
// - account-active roster can contain the newer publication (VC on 21/09);
// - TV reads account-active projection and is correct;
// - mobile must not short-circuit account refresh merely because local cache has days.
assert.doesNotMatch(
  home,
  /if \(Array\.isArray\(bundle\.roster\.days\) && bundle\.roster\.days\.length\) return;/,
  'P1: mobile startup must not skip account-active refresh just because local cache already has roster days',
);
assert.match(
  home,
  /openActiveRoster\(\)\.then\(\(active\) =>/,
  'mobile startup must query the account-active roster',
);
assert.match(
  home,
  /rosterFingerprint\(active\.roster\)/,
  'mobile startup must compare remote active publication against the cached publication before replacing it',
);
assert.match(
  home,
  /saveRoster\(active\.roster, 'Escala ativa sincronizada'\)/,
  'a newer/different account-active roster must replace the stale device cache',
);

// Care Mode parity: the published source for 17-30 Sep is VC. The Roster surface
// must consume the shared Care classifier, not relabel canonical rest as generic
// "Descanso publicado".
assert.match(
  roster,
  /carePresentationForScheduleActivity/,
  'Roster must consume the shared Care Mode authority',
);
assert.match(
  roster,
  /presentation\.state === 'FERIAS'/,
  'Roster must have an explicit vacation presentation path',
);
assert.doesNotMatch(
  roster,
  /if \(mode === 'rest'\) \{\s*if \(\/\(DO\|DOF\|DOP\|OFF\)\//,
  'generic rest copy must not bypass VC/Férias semantics before shared Care Mode',
);

console.log('PASS P1 #530 mobile account-active roster + Care Mode parity');
