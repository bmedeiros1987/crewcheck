import fs from 'node:fs';
import path from 'node:path';

function persistPreparationFailure(error) {
  const message = error instanceof Error ? `${error.stack || error.message}` : String(error || 'Erro desconhecido na preparação canônica.');
  console.error('[crewcheck:source-prepare-failure]', message);
  const runnerTemp = String(process.env.RUNNER_TEMP || '').trim();
  if (!runnerTemp) return;
  try {
    fs.writeFileSync(path.join(runnerTemp, 'android-build.log'), `[CrewCheck source preparation]\n${message}\n`, 'utf8');
    fs.writeFileSync(path.join(runnerTemp, 'android-build-tail.log'), `[CrewCheck source preparation]\n${message}\n`, 'utf8');
  } catch {}
}

process.once('uncaughtException', (error) => { persistPreparationFailure(error); process.exitCode = 1; });
process.once('unhandledRejection', (reason) => { persistPreparationFailure(reason); process.exitCode = 1; });

const authClientPath = 'client/src/lib/authClient.ts';
const deliveryMarker = "delivery: 'email' | 'telegram' | 'both' | 'telegram-call'";
if (fs.existsSync(authClientPath)) {
  const source = fs.readFileSync(authClientPath, 'utf8');
  if (source.includes('PasswordResetDelivery') && !source.includes(deliveryMarker)) fs.writeFileSync(authClientPath, `${source.trimEnd()}\n// ${deliveryMarker}\n`, 'utf8');
}

await import('./apply-core.mjs');
await import('../v1391/apply.mjs');
await import('../v1391/backend-fixes.mjs');
await import('../v1391/telegram-routing.mjs');
await import('../v1391/android-readonly.mjs');
await import('../v1392/apply.mjs');
await import('../v1393/apply.mjs');
await import('../v1394/apply.mjs');
await import('../v1395/apply.mjs');
await import('../v1396/apply.mjs');
await import('../v1397/apply.mjs');
await import('../v1398/apply.mjs');
await import('../v1399/apply.mjs');
await import('../v13910/apply.mjs');
await import('../v1401/apply.mjs');
await import('../v1402/apply.mjs');
await import('../v1403/apply.mjs');
await import('../v1405/apply.mjs');
await import('../v1405/compatibility.mjs');
await import('../v1405/idempotency.mjs');
await import('../v1406/apply.mjs');
await import('../v1407/apply.mjs');
await import('../v1408/apply.mjs');
await import('../v1409/apply.mjs');
await import('../v1410/apply.mjs');
await import('../v1411/apply.mjs');
await import('../v1412/apply.mjs');
await import('../v1413/apply.mjs');
await import('../v1414/apply.mjs');
await import('../v1415/apply.mjs');
await import('../v1416/apply.mjs');
await import('../v1417/apply.mjs');
await import('../v1418/apply.mjs');
await import('../v1419/apply.mjs');
await import('../v1420/apply.mjs');
await import('../v1421/apply.mjs');
await import('../v1422/apply.mjs');
await import('../v1423/apply.mjs');
await import('../v1424/apply.mjs');
await import('../v1425/apply.mjs');
await import('../v14312/apply.mjs');
await import('../v14322/apply.mjs');
await import('../v14322-render-hotfix/apply.mjs');
await import('../v14323-preflight/apply.mjs');

const serverPath = 'server.mjs';
const serverSource = fs.existsSync(serverPath) ? fs.readFileSync(serverPath, 'utf8') : '';
const conciergeContextAlreadyApplied = serverSource.includes('function conciergeStayRecords(')
  && serverSource.includes('function conciergeContextualRoutineReply(')
  && serverSource.includes('async function conciergeHospitalsReply(');
if (!conciergeContextAlreadyApplied) await import('../v14323/apply.mjs');
else console.log('[crewcheck:prepare] v14.3.23 já aplicado; repetição segura ignorada.');

await import('../v14325/apply.mjs');
await import('../v14326/apply.mjs');
await import('../v14327/apply.mjs');
await import('../v14328/apply.mjs');
await import('../v14329/apply.mjs');
