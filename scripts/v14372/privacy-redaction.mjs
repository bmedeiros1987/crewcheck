import fs from 'node:fs';

const files = [
  'client/src/components/premium/IFlightIntegrationView.tsx',
  'client/src/pages/Home.tsx',
  'client/src/components/v1391/RosterLaunchView.tsx',
  'client/src/lib/i18n.ts',
  'android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java',
];

const replacements = [
  ['iFlight Admin', 'Importação de escala'],
  ['iFlight Calendar Sweep', 'Importação assistida de escala'],
  ['Calendar Sweep iFlight', 'Importação assistida'],
  ['Calendário iFlight', 'Calendário de escala'],
  ['calendário iFlight', 'calendário de escala'],
  ['Escala iFlight', 'Escala'],
  ['PDF do iFlight', 'PDF da escala'],
  ['PDF baixado pelo iFlight', 'PDF selecionado'],
  ['texto do iFlight', 'texto da escala'],
  ['roster do iFlight', 'roster da escala'],
  ['dentro do iFlight', 'na fonte externa'],
  ['abertura interna do iFlight', 'abertura interna da fonte externa'],
  ['iFlight Crew', 'Fonte externa principal'],
  ['iFlight CWP', 'Fonte externa alternativa'],
  ['/iflight-crew/web/getMainPage', 'acesso externo'],
  ['Faça login/MFA com conta autorizada', 'Conclua a autenticação diretamente na fonte externa'],
  ['conta corporativa correta', 'conta autorizada'],
  ['Conta corporativa', 'Conta autorizada'],
  ['conta corporativa', 'conta autorizada'],
  ['Login corporativo', 'Autenticação externa'],
  ['login corporativo', 'autenticação externa'],
  ['Login e confirmação manual', 'Autenticação externa'],
  ['Portal oficial', 'Fonte externa'],
  ['portal oficial', 'fonte externa'],
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let source = fs.readFileSync(file, 'utf8');
  let changed = false;
  for (const [from, to] of replacements) {
    if (!source.includes(from)) continue;
    source = source.split(from).join(to);
    changed = true;
  }
  if (changed) fs.writeFileSync(file, source, 'utf8');
}

const forbiddenVisible = [
  /iFlight Admin/i,
  /Calendar Sweep iFlight/i,
  /conta corporativa/i,
  /login corporativo/i,
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const source = fs.readFileSync(file, 'utf8');
  for (const pattern of forbiddenVisible) {
    if (pattern.test(source)) {
      throw new Error(`[privacy-p0] referência visível proibida ainda presente em ${file}: ${pattern}`);
    }
  }
}

console.log('[privacy-p0] referências visíveis ao portal/login corporativo neutralizadas nas superfícies distribuídas.');
