// Financeiro 2.0 — eligible averages over a competence window.
//
// The average of variable pay is where eligibility actually bites: an indemnity or a per
// diem that leaks in here inflates every downstream figure. Inclusion is decided by the
// resolved rubric flags only, and every decision — in or out — is reported with its
// reason so the result can be read back by a human.

import { averageCents, sumCents } from './money.mjs';
import { competenceKey, competenceWindow } from './competence.mjs';
import { RUBRIC_INTEGRATION, integratesFor, resolveRubric } from './rubricTaxonomy.mjs';

/**
 * @param target one of RUBRIC_INTEGRATION.VACATION | RUBRIC_INTEGRATION.THIRTEENTH
 * @returns { averageCents, window, includedItems, excludedItems, perCompetence }
 */
export function computeEligibleAverages({ earnings = [], catalog, rule, referenceCompetence, windowMonths, target }) {
  const months = competenceWindow(referenceCompetence, windowMonths);
  const windowKeys = new Set(months.map(competenceKey));
  const includedItems = [];
  const excludedItems = [];
  const perCompetence = new Map(months.map((competence) => [competenceKey(competence), []]));

  for (const earning of earnings) {
    const rubric = resolveRubric(catalog, earning.rubricCode, rule?.rubricOverrides);
    const item = {
      rubricCode: rubric.code,
      rubricName: rubric.name,
      nature: rubric.nature,
      competenceKey: earning.competenceKey,
      amountCents: earning.amountCents,
    };
    if (!windowKeys.has(earning.competenceKey)) {
      excludedItems.push({ ...item, reason: 'fora da janela de apuração' });
      continue;
    }
    if (rubric.isDeduction) {
      excludedItems.push({ ...item, reason: 'rubrica de desconto não compõe média' });
      continue;
    }
    // A integração é verificada antes da composição de média porque é o fato
    // contratual mais forte: dizer que uma indenizatória "não compõe média" esconde
    // que ela não integra a verba em nenhuma hipótese.
    if (!integratesFor(rubric, target)) {
      const label = target === RUBRIC_INTEGRATION.VACATION ? 'férias' : '13º';
      excludedItems.push({ ...item, reason: `rubrica não integra ${label}` });
      continue;
    }
    if (!rubric.entersAverages) {
      excludedItems.push({ ...item, reason: `natureza ${rubric.nature} não compõe média` });
      continue;
    }
    includedItems.push(item);
    perCompetence.get(earning.competenceKey).push(earning.amountCents);
  }

  const monthlyTotals = months.map((competence) => sumCents(perCompetence.get(competenceKey(competence)) || []));
  return Object.freeze({
    averageCents: averageCents(monthlyTotals),
    windowMonths: months.map(competenceKey),
    monthlyTotalsCents: monthlyTotals,
    includedItems,
    excludedItems,
  });
}
