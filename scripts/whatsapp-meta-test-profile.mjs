import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(fs.readFileSync(new URL('../config/whatsapp-meta-test.example.json', import.meta.url), 'utf8'));
// No configuration flag can turn this mock runner into a live sender/server.
if (process.argv.includes('--live') || config.mode !== 'mock' || config.liveEnabled !== false || config.phoneNumberId !== '1259259633936048' || config.businessAccountId !== '1374607321298577') {
  console.error('BLOCKED_TEST_PROFILE: live transport and isolated database are not attested'); process.exit(2);
}
const env = { PATH: process.env.PATH || '', HOME: process.env.HOME || '', TMPDIR: process.env.TMPDIR || '/tmp', LANG: 'C', NODE_OPTIONS: `--import=${fileURLToPath(new URL('./whatsapp-test-network-block.mjs', import.meta.url))}` };
for (const script of ['scripts/v139/apply.mjs', 'scripts/regression-whatsapp-sender.mjs', 'scripts/regression-whatsapp-menu.mjs', 'scripts/regression-whatsapp-payload-dedup.mjs', 'scripts/regression-whatsapp-pdf.mjs', 'scripts/regression-whatsapp-pdf-integration.mjs', 'scripts/regression-whatsapp-query-parity.mjs', 'scripts/regression-whatsapp-guest-demo.mjs', 'scripts/regression-whatsapp-linked-visitor.mjs']) {
  const result = spawnSync(process.execPath, [script], { cwd: root, env, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
  // Existing fixtures use fictional data; avoid forwarding arbitrary child logs.
  if (result.status !== 0 || result.error) { console.error(`FAIL_MOCK_PROFILE: ${script}`); process.exit(1); }
  console.log(`PASS_MOCK_PROFILE: ${script}`);
}
console.log('PASS: mock-only Meta test profile; no network, inherited app credentials, server startup or database access');
