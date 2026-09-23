import fs from 'node:fs';
export const releaseVersion = JSON.parse(fs.readFileSync(new URL('../android-play/release-policy.json', import.meta.url), 'utf8')).versionName;
