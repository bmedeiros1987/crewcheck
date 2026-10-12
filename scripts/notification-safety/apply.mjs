import fs from 'node:fs';
import { guardWakeupSession } from './wakeup-session.mjs';
const path = 'server/telegram-fast-ack.mjs';
let source = fs.readFileSync(path, 'utf8');
function replace(name, nextName, body) {
  const start = source.indexOf(`async function ${name}(`);
  const end = source.indexOf(`async function ${nextName}(`, start);
  if (start < 0 || end <= start) throw new Error(`Notification safety: missing ${name} boundary`);
  source = source.slice(0, start) + body + '\n\n' + source.slice(end);
}
if (!source.includes("from './notification-job-safety.mjs'")) throw new Error('Notification safety import missing');
replace('scheduleJob', 'listJobs', `async function scheduleJob(req, res) {
  return safeScheduleJob({ req, res, identity, readJson, dbPool, ensureNotificationTable, linkedTelegramRecord, sendJson });
}`);
replace('cancelJob', 'registerCommuteMonitor', `async function cancelJob(req, res) {
  return safeCancelJob({ req, res, identity, readJson, dbPool, sendJson });
}`);
if (!source.includes('dispatchClaimedJob(db, job') || !source.includes("status IN ('processing','dispatching')")) throw new Error('Notification dispatch safety lost during preparation');
fs.writeFileSync(path, source);

const platformPath = 'server/platform.mjs';
let platform = fs.readFileSync(platformPath, 'utf8');
const declaration = "import { notificationStateDeletionStatements } from './v139/notificationStateDeletion.mjs';";
if (!platform.includes(declaration)) platform = declaration + '\n' + platform;
if (!platform.includes('for (const [sql, params] of notificationStateDeletionStatements(')) {
  const anchor = "    await client.query('DELETE FROM crewcheck_platform_profiles WHERE email=$1', [context.identity.email]);";
  if (!platform.includes(anchor)) throw new Error('Notification state deletion: canonical account deletion anchor missing');
  platform = platform.replace(anchor, anchor + '\n    for (const [sql, params] of notificationStateDeletionStatements(context.identity.email)) {\n      await deleteIfTableExists(client, sql, params);\n    }');
}
fs.writeFileSync(platformPath, platform);

// Materialize only the existing wakeup panel; roster/APZ/regulation stay untouched.
const homePath = 'client/src/pages/Home.tsx';
let home = fs.readFileSync(homePath, 'utf8');
home = home.replace("{ authFetch, getStoredUser, logout }", "{ authFetch, getToken, getStoredUser, logout }");
const readinessImport = "import { NotificationReadiness } from '@/components/notifications/NotificationReadiness';";
if (!home.includes(readinessImport)) home = readinessImport + '\n' + home;
const wakeStart = home.indexOf('function WakeupView(');
const wakeEnd = home.indexOf('function PresentationManagerView', wakeStart);
if (wakeStart < 0 || wakeEnd < 0) throw new Error('Notification readiness: wakeup boundary missing');
let wake = home.slice(wakeStart, wakeEnd);
if (!wake.includes('<NotificationReadiness/>')) wake = wake.replace('</h1>', '</h1><NotificationReadiness/>');
wake = wake.replace(/toast\.success\(payload\?\.telegramLinked[^\n]+/g, "window.dispatchEvent(new Event('crewcheck:notification-jobs-changed'));\n      toast.success(payload?.message || 'Solicitação registrada no servidor; entrega não confirmada.');");
wake = wake.replace("toast.success('Despertador ativo no servidor para ' + wakeupDateLabel(planned) + '.');", "window.dispatchEvent(new Event('crewcheck:notification-jobs-changed'));\n      toast.success(payload?.message || 'Solicitação registrada no servidor; entrega não confirmada.');");
if (!wake.includes("window.dispatchEvent(new Event('crewcheck:notification-jobs-changed'));\n      toast.success(payload.cancelled")) wake = wake.replace("toast.success(payload.cancelled ? 'Despertador cancelado.' : 'O despertador já não estava pendente.');", "window.dispatchEvent(new Event('crewcheck:notification-jobs-changed'));\n      toast.success(payload.cancelled ? 'Despertador cancelado.' : 'O despertador já não estava pendente.');");
wake = wake.replace("job.status === 'sent' ? 'Enviado'", "job.status === 'sent' ? 'Aceito pelo provedor; entrega não confirmada'");
wake = wake.replace("'Enviado em '", "'Aceito pelo provedor em '");
// Never include the roster/airport/presentation in a new external wakeup message.
wake = wake.replace(/message: 'Despertador CrewCheck: hora de se preparar para '[^\n]+/, "message: 'Despertador CrewCheck: confira sua preparação no aplicativo.',");
wake = wake.replace(/message: `Despertador CrewCheck: prepare-se para[^\n]+/, "message: 'Despertador CrewCheck: confira sua preparação no aplicativo.',");
// Saving a server job must not request device/browser permission implicitly.
wake = wake.replace(/      if \(typeof Notification[^\n]+Notification\.requestPermission\(\)[^\n]+\n/g, '');
// Server registration must not also arm an unscoped page timer for a duplicate notice.
wake = wake.replace(/      window\.setTimeout\(\(\) => notifyCrewCheck[^\n]+\n/g, '');
wake = guardWakeupSession(wake);
home = home.slice(0, wakeStart) + wake + home.slice(wakeEnd);
fs.writeFileSync(homePath, home);
