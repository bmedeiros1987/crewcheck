import fs from 'node:fs';
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
