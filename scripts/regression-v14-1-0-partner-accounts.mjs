import fs from 'node:fs';

const required = [
  ['server/v1410/partnerAccounts.mjs', [
    "url.pathname !== '/api/admin/partner-accounts'",
    'crypto.scryptSync',
    'must_change_password=1',
    "plan='premium_unlimited'",
    'isAdminEmail(email)',
  ]],
  ['server/v139/index.mjs', [
    "handlePartnerAccountsRoute",
    "../v1410/partnerAccounts.mjs",
  ]],
  ['client/src/pages/AdminPartnerAccountsPage.tsx', [
    'Contas de parceiros',
    'Criar conta Premium',
    '/api/admin/partner-accounts',
    'Copiar dados de acesso',
  ]],
  ['client/src/App.tsx', [
    'AdminPartnerAccountsPage',
    '/admin/partners',
    'Gerenciar contas de parceiros',
  ]],
];

for (const [file, markers] of required) {
  if (!fs.existsSync(file)) throw new Error(`Arquivo ausente: ${file}`);
  const source = fs.readFileSync(file, 'utf8');
  for (const marker of markers) {
    if (!source.includes(marker)) throw new Error(`Marcador ausente em ${file}: ${marker}`);
  }
}

const backend = fs.readFileSync('server/v1410/partnerAccounts.mjs', 'utf8');
if (/temporaryPassword\s*[,)]\s*\]/.test(backend)) {
  throw new Error('A senha temporária não pode ser persistida no banco.');
}
if (!backend.includes('return sendJson(res, 201')) {
  throw new Error('A criação deve devolver confirmação explícita.');
}

console.log('CrewCheck v14.1.0 partner accounts regression OK');
