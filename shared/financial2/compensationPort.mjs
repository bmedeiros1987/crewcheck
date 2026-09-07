// Financeiro 2.0 — data adapter contract (port).
//
// This is the ONLY shape the engine accepts. It exists so the calculator can never read
// a roster, a parsed PDF, a canonical event or a duty segment: whoever owns those
// structures is responsible for projecting them onto this contract, and that projection
// lives outside the domain. Nothing in shared/financial2 imports the parser, the
// canonical roster, journey segmentation or the compliance engine — by construction,
// not by convention.
//
// The port validates and normalizes; it never invents. A missing or malformed field is
// an error, never a zero silently carried into a payroll figure.

import { assertCents } from './money.mjs';
import { competenceKey, makeCompetence } from './competence.mjs';

/** One rubric amount already attributed to a competence by the adapter. */
function normalizeEarning(raw, index) {
  const label = `earnings[${index}]`;
  const code = String(raw?.rubricCode || '').trim();
  if (!code) throw new TypeError(`[financial2/port] ${label} exige \`rubricCode\`.`);
  const competence = makeCompetence(raw?.competence?.year, raw?.competence?.month);
  return Object.freeze({
    rubricCode: code,
    competence,
    competenceKey: competenceKey(competence),
    amountCents: assertCents(raw?.amountCents, `${label}.amountCents`),
    quantity: raw?.quantity === undefined || raw?.quantity === null ? null : Number(raw.quantity),
    note: raw?.note ? String(raw.note) : '',
  });
}

/** A configurable deduction. Either a fixed amount or a rate over a declared basis. */
function normalizeDeduction(raw, index) {
  const label = `deductions[${index}]`;
  const code = String(raw?.code || '').trim();
  if (!code) throw new TypeError(`[financial2/port] ${label} exige \`code\`.`);
  const hasFixed = raw?.amountCents !== undefined && raw?.amountCents !== null;
  const hasRate = raw?.rate !== undefined && raw?.rate !== null;
  if (hasFixed === hasRate) {
    throw new TypeError(`[financial2/port] ${label} exige exatamente um entre \`amountCents\` e \`rate\`.`);
  }
  const basis = String(raw?.basis || 'gross');
  if (!['gross', 'proportional', 'installment'].includes(basis)) {
    throw new RangeError(`[financial2/port] ${label} tem base desconhecida: ${basis}`);
  }
  return Object.freeze({
    code,
    name: String(raw?.name || code),
    basis,
    amountCents: hasFixed ? assertCents(raw.amountCents, `${label}.amountCents`) : null,
    rate: hasRate ? Number(raw.rate) : null,
  });
}

/** One vacation period. Independent by design so periods may sit in distinct competences. */
function normalizeVacationPeriod(raw, index) {
  const label = `vacationPeriods[${index}]`;
  const days = Number(raw?.days);
  if (!Number.isInteger(days) || days < 1) throw new RangeError(`[financial2/port] ${label}.days deve ser inteiro positivo.`);
  const competence = makeCompetence(raw?.competence?.year, raw?.competence?.month);
  return Object.freeze({
    id: String(raw?.id || `${competenceKey(competence)}-${days}d-${index + 1}`),
    days,
    competence,
    competenceKey: competenceKey(competence),
    soldDays: Number.isInteger(Number(raw?.soldDays)) ? Number(raw.soldDays) : 0,
    startIso: raw?.startIso ? String(raw.startIso) : '',
    deductions: (raw?.deductions || []).map(normalizeDeduction),
  });
}

/**
 * Normalizes everything the engine is allowed to see. `monthlyFixedCents` is the
 * contractual fixed remuneration for the reference competence — already resolved by the
 * adapter, never inferred here from an activity list.
 */
export function normalizeCompensationInput(raw = {}) {
  const profile = String(raw?.profile || '').trim();
  if (!profile) throw new TypeError('[financial2/port] entrada exige `profile`.');
  const referenceCompetence = makeCompetence(raw?.referenceCompetence?.year, raw?.referenceCompetence?.month);
  return Object.freeze({
    profile,
    referenceCompetence,
    referenceCompetenceKey: competenceKey(referenceCompetence),
    monthlyFixedCents: assertCents(raw?.monthlyFixedCents, 'monthlyFixedCents'),
    earnings: Object.freeze((raw?.earnings || []).map(normalizeEarning)),
    deductions: Object.freeze((raw?.deductions || []).map(normalizeDeduction)),
    // Months actually worked in the reference year, as counted by the adapter. The
    // engine never derives this from duty data; it consumes the declared count.
    workedMonths: Object.freeze((raw?.workedMonths || []).map((entry, index) => {
      const competence = makeCompetence(entry?.competence?.year, entry?.competence?.month);
      const daysWorked = Number(entry?.daysWorked);
      if (!Number.isInteger(daysWorked) || daysWorked < 0) {
        throw new RangeError(`[financial2/port] workedMonths[${index}].daysWorked deve ser inteiro não negativo.`);
      }
      return Object.freeze({ competence, competenceKey: competenceKey(competence), daysWorked });
    })),
    vacationPeriods: Object.freeze((raw?.vacationPeriods || []).map(normalizeVacationPeriod)),
  });
}

export const COMPENSATION_PORT_VERSION = 'financial2.port.v1';
