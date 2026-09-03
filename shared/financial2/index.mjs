// Financeiro 2.0 — public surface.
//
// Layering, top to bottom: pure domain (money, competence, rubrics, averages, engines),
// contractual configuration (rules, seed profiles), the adapter contract (port) and the
// projection used by a UI. No layer below the port knows a roster exists.

export * from './money.mjs';
export * from './competence.mjs';
export * from './rubricTaxonomy.mjs';
export * from './compensationRules.mjs';
export * from './averages.mjs';
export * from './deductions.mjs';
export * from './vacationEngine.mjs';
export * from './thirteenthEngine.mjs';
export * from './simulator.mjs';
export { normalizeCompensationInput, COMPENSATION_PORT_VERSION } from './compensationPort.mjs';
