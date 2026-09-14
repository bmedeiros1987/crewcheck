import fs from 'node:fs';

const homePath = 'client/src/pages/Home.tsx';
const rosterPath = 'client/src/components/v1391/RosterLaunchView.tsx';
const marker = 'P1_674_FINANCE_MONTH_PARITY';

for (const path of [homePath, rosterPath]) {
  if (!fs.existsSync(path)) throw new Error(`[${marker}] arquivo ausente: ${path}`);
}

let home = fs.readFileSync(homePath, 'utf8');
if (!home.includes("@/lib/financialCompetence")) {
  const anchor = "import { resolveActFinancialRules, resolvePerDiemRule, type AirportPerDiemOverrides, type PerDiemCurrency, type PerDiemRateKey } from '@/lib/financialRules';";
  if (!home.includes(anchor)) throw new Error(`[${marker}] import financeiro não localizado`);
  home = home.replace(anchor, `${anchor}\nimport { filterFinancialRowsToCompetence } from '@/lib/financialCompetence';`);
}

if (!home.includes('const competenceRows = filterFinancialRowsToCompetence(rows, roster);')) {
  const anchor = '  const convertedTotalBRL = rows.reduce((sum, row) => sum + (row.convertedBRL || 0), 0);';
  if (!home.includes(anchor)) throw new Error(`[${marker}] total mensal legado não localizado`);
  home = home.replace(
    anchor,
    `  const competenceRows = filterFinancialRowsToCompetence(rows, roster);\n  const competenceConvertedTotalBRL = competenceRows.reduce((sum, row) => sum + (row.convertedBRL || 0), 0);\n  const convertedTotalBRL = rows.reduce((sum, row) => sum + (row.convertedBRL || 0), 0);`,
  );
}

if (!home.includes('monthly: competenceConvertedTotalBRL')) {
  const anchor = '    monthly: convertedTotalBRL,';
  if (!home.includes(anchor)) throw new Error(`[${marker}] retorno monthly legado não localizado`);
  home = home.replace(anchor, '    monthly: competenceConvertedTotalBRL,');
}

if (!home.includes(marker)) {
  const anchor = 'function calculatePerDiem(events: ZeroLeg[], roster: CrewRoster) {';
  if (!home.includes(anchor)) throw new Error(`[${marker}] calculatePerDiem ausente`);
  home = home.replace(anchor, `// ${marker}: monthly belongs only to roster.year/month; carry rows remain detail evidence.\n${anchor}`);
}
fs.writeFileSync(homePath, home, 'utf8');

let roster = fs.readFileSync(rosterPath, 'utf8');
if (!roster.includes('const perDiemTotal = Number(scopedFinance?.perdiem?.monthly || 0);')) {
  const anchor = '  const perDiemTotal = selectedPerDiemRows.reduce((sum, row) => sum + Number(row.convertedBRL || 0), 0);';
  if (!roster.includes(anchor)) throw new Error(`[${marker}] soma independente da Escala não localizada`);
  roster = roster.replace(anchor, '  const perDiemTotal = Number(scopedFinance?.perdiem?.monthly || 0);');
}
fs.writeFileSync(rosterPath, roster, 'utf8');

for (const [label, source, fragments] of [
  ['Home', home, ['filterFinancialRowsToCompetence(rows, roster)', 'monthly: competenceConvertedTotalBRL', marker]],
  ['Roster', roster, ['scopedFinance?.perdiem?.monthly']],
]) {
  for (const fragment of fragments) if (!source.includes(fragment)) throw new Error(`[${marker}] ${label} sem contrato: ${fragment}`);
}

console.log(`[${marker}] total mensal unificado por competência nominal.`);
