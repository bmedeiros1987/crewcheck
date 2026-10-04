import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const MYCREWCARE_OWNED_PATHS = [
  'android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckMyCrewCarePortal.java',
  'android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java',
  'client/src/lib/myCrewCare.ts',
  'client/src/lib/crewWake.ts',
  'client/src/components/wakeup/CrewWakeSurface.tsx',
  'scripts/wake-v1/apply.mjs',
  'scripts/v139/apply.mjs',
];

/** #907 owns MyCrewCare; #872 may contribute Wake-only code after reconciliation.
 * Inspect both source and post-materialization output, so an old materializer
 * cannot silently reinstall its global session or parameterless native bridge.
 */
export function myCrewCareOwnershipViolations(sources) {
  const errors = [];
  const portalPath = MYCREWCARE_OWNED_PATHS[0];
  const portal = sources[portalPath] || '';
  for (const marker of ['RELEASE_ENABLED = false', 'verifyAndExtract', 'transportationCardSelector', 'crewcheck:mycrewcare-v2']) {
    if (!portal.includes(marker)) errors.push(`${portalPath}: missing v2 ownership marker ${marker}`);
  }
  for (const marker of ['getSharedPreferences', 'CookieManager', 'addJavascriptInterface', 'dispatchEmptySnapshot']) {
    if (portal.includes(marker)) errors.push(`${portalPath}: legacy/unsafe portal marker ${marker}`);
  }
  const entry = sources['client/src/lib/myCrewCare.ts'] || '';
  if (!entry.includes('shared/myCrewCare.mjs') || !entry.includes('shared/myCrewCareNativeAdapter.mjs')) errors.push('Missing sole exported MyCrewCare v2 client entrypoint');
  for (const file of MYCREWCARE_OWNED_PATHS.slice(1)) {
    const source = sources[file] || '';
    for (const marker of ['crewcheck:mycrewcare-update', 'crewcheck:mycrewcare-status', 'crewcheck:mycrewcare:snapshot:v1', 'crewcheck:mycrewcare:status', 'openMyCrewCare:function()', 'public boolean openMyCrewCare()', 'myCrewCarePortal.syncIfConnected()']) {
      if (source.includes(marker)) errors.push(`${file}: legacy #872 MyCrewCare writer/bridge ${marker}`);
    }
  }
  const preparation = sources['scripts/v139/apply.mjs'] || '';
  if (/import\s*\(\s*['"]\.\.\/wake-v1\/apply\.mjs['"]\s*\)/.test(preparation)) errors.push('Legacy #872 wake-v1 materializer must not be composed into v2; port reviewed Wake-only delta instead');
  return errors;
}

export function assertMyCrewCareOwnership(root = process.cwd()) {
  const sources = Object.fromEntries(MYCREWCARE_OWNED_PATHS.map((file) => {
    const absolute = path.join(root, file);
    return [file, fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : ''];
  }));
  const errors = myCrewCareOwnershipViolations(sources);
  if (errors.length) throw new Error(`MyCrewCare single-owner composition blocked:\n${errors.join('\n')}\n#907 replaces #872 MyCrewCare only. Preserve Wake; consume client/src/lib/myCrewCare.ts. Do not rewrite the old portal.`);
  return sources;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  assertMyCrewCareOwnership();
  console.log('OK MyCrewCare v2 sole-owner composition; legacy #872 MyCrewCare port blocked');
}
