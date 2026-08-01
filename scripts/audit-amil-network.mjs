#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const input = process.argv[2] || 'server/data/amil-network-s450-s750.json';
const EMERGENCY_CODES = new Set(['PA', 'PS', 'PS CARD', 'PS OBST', 'PSI', 'PSO']);
const ALLOWED_CODES = new Set(['PA', 'PS', 'PS CARD', 'PS OBST', 'PSI', 'PSO', 'HP', 'HD', 'M', 'H', 'H CARD', 'H ORT', 'DIAGNOSTICO']);

function fail(message, details = {}) {
  return { severity: 'error', message, ...details };
}

function warn(message, details = {}) {
  return { severity: 'warning', message, ...details };
}

function covered(provider, plan) {
  return Array.isArray(provider?.plans?.[plan]) && provider.plans[plan].length > 0;
}

function emergency(provider, plan) {
  return (provider?.plans?.[plan] || []).some((code) => EMERGENCY_CODES.has(String(code).trim().toUpperCase()));
}

const payload = JSON.parse(await readFile(resolve(input), 'utf8'));
const findings = [];

if (payload.schemaVersion !== 1) findings.push(fail('schemaVersion inesperada', { actual: payload.schemaVersion }));
if (!Array.isArray(payload.sources) || payload.sources.length === 0) findings.push(fail('sources ausente ou vazio'));
if (!Array.isArray(payload.providers) || payload.providers.length === 0) findings.push(fail('providers ausente ou vazio'));
if (!Array.isArray(payload.plans) || !['S450', 'S750'].every((plan) => payload.plans.includes(plan))) {
  findings.push(fail('snapshot não declara S450 e S750'));
}

const sourceIds = new Set();
for (const source of payload.sources || []) {
  if (!source.id) findings.push(fail('fonte sem id'));
  if (sourceIds.has(source.id)) findings.push(fail('fonte duplicada', { sourceId: source.id }));
  sourceIds.add(source.id);
  if (!source.url || !/^https:\/\//.test(source.url)) findings.push(fail('fonte sem URL HTTPS', { sourceId: source.id }));
  if (!source.sha256 || !/^[a-f0-9]{64}$/i.test(source.sha256)) findings.push(fail('fonte sem SHA-256 válido', { sourceId: source.id }));
  if (!Number.isInteger(source.pages) || source.pages < 1) findings.push(fail('fonte sem contagem de páginas válida', { sourceId: source.id }));
  if (!Number.isInteger(source.importedRecords) || source.importedRecords < 0) findings.push(fail('fonte sem importedRecords válido', { sourceId: source.id }));
}

const providerIds = new Set();
const identityKeys = new Map();
const planTotals = { S450: 0, S750: 0 };
const emergencyTotals = { S450: 0, S750: 0 };
const emergencyByState = { S450: new Map(), S750: new Map() };

for (const provider of payload.providers || []) {
  const id = String(provider.id || '');
  if (!id) findings.push(fail('prestador sem id', { name: provider.name }));
  if (providerIds.has(id)) findings.push(fail('id de prestador duplicado', { id, name: provider.name }));
  providerIds.add(id);

  for (const key of ['name', 'city', 'state', 'category', 'sourceId']) {
    if (!String(provider[key] || '').trim()) findings.push(fail(`prestador sem ${key}`, { id, name: provider.name }));
  }
  if (provider.sourceId && !sourceIds.has(provider.sourceId)) findings.push(fail('prestador referencia sourceId inexistente', { id, sourceId: provider.sourceId }));
  if (!Number.isInteger(provider.sourcePage) || provider.sourcePage < 1) findings.push(fail('sourcePage inválida', { id, name: provider.name }));

  const identity = [provider.state, provider.city, provider.name, provider.category]
    .map((value) => String(value || '').trim().toUpperCase())
    .join('|');
  const previous = identityKeys.get(identity);
  if (previous && previous !== id) findings.push(warn('possível duplicidade semântica de prestador', { ids: [previous, id], identity }));
  identityKeys.set(identity, id);

  let hasAnyPlan = false;
  for (const plan of ['S450', 'S750']) {
    const codes = provider?.plans?.[plan];
    if (!Array.isArray(codes)) {
      findings.push(fail('plano ausente ou inválido no prestador', { id, plan }));
      continue;
    }
    if (codes.length) {
      hasAnyPlan = true;
      planTotals[plan] += 1;
    }
    for (const rawCode of codes) {
      const code = String(rawCode || '').trim().toUpperCase();
      if (!ALLOWED_CODES.has(code)) findings.push(warn('código de serviço não reconhecido', { id, plan, code }));
    }
    if (emergency(provider, plan)) {
      emergencyTotals[plan] += 1;
      const state = String(provider.state || '').trim().toUpperCase();
      emergencyByState[plan].set(state, (emergencyByState[plan].get(state) || 0) + 1);
    }
  }
  if (!hasAnyPlan) findings.push(fail('prestador sem cobertura S450/S750', { id, name: provider.name }));
}

for (const plan of ['S450', 'S750']) {
  if (planTotals[plan] === 0) findings.push(fail(`nenhum prestador coberto no ${plan}`));
  if (emergencyTotals[plan] === 0) findings.push(fail(`nenhum PA/PS detectado no ${plan}`));
}

const hospitalStates = new Set((payload.sources || []).filter((source) => source.category === 'hospital').map((source) => source.state));
for (const plan of ['S450', 'S750']) {
  for (const state of hospitalStates) {
    if (!emergencyByState[plan].has(state)) findings.push(warn('UF sem PA/PS detectado no snapshot', { plan, state }));
  }
}

const errors = findings.filter((item) => item.severity === 'error');
const warnings = findings.filter((item) => item.severity === 'warning');
const summary = {
  sourceFile: input,
  generatedAt: payload.generatedAt || null,
  sources: payload.sources?.length || 0,
  providers: payload.providers?.length || 0,
  plans: planTotals,
  emergencyProviders: emergencyTotals,
  emergencyStates: {
    S450: emergencyByState.S450.size,
    S750: emergencyByState.S750.size,
  },
  missingPublishedStates: payload.missingPublishedStates || [],
  errors: errors.length,
  warnings: warnings.length,
};

console.log(JSON.stringify({ summary, findings }, null, 2));
process.exit(errors.length ? 2 : 0);
