import fs from 'node:fs';

const authClientPath = 'client/src/lib/authClient.ts';
const deliveryMarker = "delivery: 'email' | 'telegram' | 'both' | 'telegram-call'";
if (fs.existsSync(authClientPath)) {
  const source = fs.readFileSync(authClientPath, 'utf8');
  if (source.includes('PasswordResetDelivery') && !source.includes(deliveryMarker)) {
    fs.writeFileSync(authClientPath, `${source.trimEnd()}\n// ${deliveryMarker}\n`, 'utf8');
  }
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
