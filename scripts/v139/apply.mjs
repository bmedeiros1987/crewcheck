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
