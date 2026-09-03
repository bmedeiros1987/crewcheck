// Financeiro 2.0 — projection layer.
//
// Domain-level surface for questions like "15 dias em março + 15 dias em outubro":
// it groups independently-computed results by competence so a UI can show a timeline
// without recomputing anything or re-deriving which rule applied where.

import { sumCents } from './money.mjs';
import { compareCompetence, competenceFromKey } from './competence.mjs';
import { computeVacationPlan } from './vacationEngine.mjs';
import { computeThirteenthInstallments } from './thirteenthEngine.mjs';

function projectionRow(competenceKey) {
  return {
    competenceKey,
    competence: competenceFromKey(competenceKey),
    items: [],
    grossCents: 0,
    deductionsCents: 0,
    netCents: 0,
  };
}

function pushItem(rows, competenceKey, item) {
  if (!rows.has(competenceKey)) rows.set(competenceKey, projectionRow(competenceKey));
  const row = rows.get(competenceKey);
  row.items.push(item);
  row.grossCents += item.grossCents;
  row.deductionsCents += item.deductionsCents;
  row.netCents += item.netCents;
}

/**
 * Projects a vacation plan (and optionally the thirteenth) onto a competence timeline.
 * Every row carries the rule that produced it, so a plan crossing a rule change is
 * readable as such instead of appearing as an unexplained change in value.
 */
export function simulateCompensation({ input, catalog, rules, includeThirteenth = false, year = null }) {
  const rows = new Map();
  const plan = computeVacationPlan({ input, catalog, rules });

  for (const period of plan.periods) {
    pushItem(rows, period.competenceKey, {
      kind: 'vacation_period',
      reference: period.periodId,
      label: `Férias ${period.days} dia(s)${period.soldDays ? ` + ${period.soldDays} de abono` : ''}`,
      grossCents: period.grossCents,
      deductionsCents: period.deductionsCents,
      netCents: period.netCents,
      rule: period.explanation.rule,
      detail: period,
    });
  }

  let thirteenth = null;
  if (includeThirteenth) {
    thirteenth = computeThirteenthInstallments({ input, catalog, rules, year });
    for (const parcel of [thirteenth.first, thirteenth.second]) {
      pushItem(rows, parcel.competenceKey, {
        kind: `thirteenth_${parcel.installment}`,
        reference: `${parcel.year}-13-${parcel.installment}`,
        label: `13º ${parcel.installment === 'first' ? '1ª' : '2ª'} parcela (${parcel.avos}/${parcel.avosDenominator})`,
        grossCents: parcel.payableGrossCents,
        deductionsCents: parcel.deductionsCents,
        netCents: parcel.netCents,
        rule: parcel.explanation.rule,
        detail: parcel,
      });
    }
  }

  const timeline = [...rows.values()].sort((left, right) => compareCompetence(left.competence, right.competence));
  return Object.freeze({
    kind: 'compensation_projection',
    profile: input.profile,
    timeline: Object.freeze(timeline.map((row) => Object.freeze(row))),
    competences: timeline.map((row) => row.competenceKey),
    vacation: plan,
    thirteenth,
    totals: Object.freeze({
      grossCents: sumCents(timeline.map((row) => row.grossCents)),
      deductionsCents: sumCents(timeline.map((row) => row.deductionsCents)),
      netCents: sumCents(timeline.map((row) => row.netCents)),
    }),
  });
}
