import fs from 'node:fs';

const checks = [
  ['client/src/pages/Home.tsx', ["const DEFAULT_VERSION = '14.2.9';"]],
  ['client/src/main.tsx', ['v1429/reliability-premium.css']],
  ['client/src/pages/AdminPartnerAccountsPage.tsx', ['cc-email-quota', 'emailQuota', 'Enviar convite novamente']],
  ['server/v1410/partnerAccounts.mjs', ['crewcheck_email_monthly_usage', 'monthly_limit INT NOT NULL DEFAULT 500', 'Aguarde 2 minutos antes de reenviar']],
  ['client/src/components/v1429/reliability-premium.css', ['overflow-wrap:anywhere', '.cz-smart-content>*{position:static', '.cz-bottom-nav{z-index:80']],
];
for (const [path, markers] of checks) {
  if (!fs.existsSync(path)) throw new Error(`[v14.2.9] Arquivo ausente: ${path}`);
  const source = fs.readFileSync(path, 'utf8');
  for (const marker of markers) if (!source.includes(marker)) throw new Error(`[v14.2.9] Marcador ausente em ${path}: ${marker}`);
}
console.log('[v14.2.9] Regressão de confiabilidade aprovada.');
