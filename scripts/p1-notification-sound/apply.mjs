import fs from 'node:fs';
const file = 'client/src/pages/Home.tsx';
let source = fs.readFileSync(file, 'utf8');
const statement = "import NotificationSoundSetting from '@/components/pulse/NotificationSoundSetting';";
if (!source.includes(statement)) source = statement + '\n' + source;
const anchor = '    <NotificationPermissionSetting/>';
if (!source.includes('    <NotificationSoundSetting/>')) {
  if (source.split(anchor).length !== 2) throw new Error('[notification-sound] settings anchor missing or duplicated');
  source = source.replace(anchor, anchor + '\n    <NotificationSoundSetting/>');
}
if ((source.match(/<NotificationSoundSetting\/>/g) || []).length !== 1) throw new Error('[notification-sound] duplicate sound settings');
fs.writeFileSync(file, source);
console.log('[notification-sound] optional foreground sound settings ready');
