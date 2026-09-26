const SUPPORTED_INTENTS = new Set(['standby_callout_window', 'base_context_alert']);
const ROLE_LABEL = { pilot: 'Piloto', cabin: 'Comissário' };
const FLEET_LABEL = { wide_body: 'WideBody', narrow_body: 'NarrowBody', embraer: 'Embraer' };
const NON_IMPERATIVE_PRIORITY = { ACT: 40, CCT: 30, RBAC: 20, LAW: 10 };

export class RegulatoryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RegulatoryError';
    this.code = code;
    Object.assign(this, details);
  }
}

function civilDate(value, field) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match || Number.isNaN(Date.parse(`${match[1]}T00:00:00Z`))) throw new RegulatoryError('INVALID_DATE', `${field} deve conter uma data civil ISO válida.`);
  return match[1];
}

function containsDate(item, date) {
  return civilDate(item.effectiveFrom, 'effectiveFrom') <= date && (!item.effectiveTo || civilDate(item.effectiveTo, 'effectiveTo') >= date);
}

export function resolveProfileAt(history = [], at) {
  const date = civilDate(at, 'at');
  const matches = history.filter((entry) => containsDate(entry, date));
  if (matches.length !== 1) {
    throw new RegulatoryError(matches.length ? 'AMBIGUOUS_PROFILE' : 'PROFILE_NOT_EFFECTIVE', matches.length ? 'Há mais de um perfil vigente nessa data.' : 'Não há perfil vigente nessa data.', { at: date });
  }
  const profile = structuredClone(matches[0]);
  const required = ['company', 'role', 'contractualBase', 'contractualAirport'];
  if (profile.role === 'pilot') required.push('fleetGroup');
  const missingFields = required.filter((field) => !String(profile[field] || '').trim());
  if (!['pilot', 'cabin'].includes(profile.role)) missingFields.push('role');
  if (profile.role === 'pilot' && !['wide_body', 'narrow_body', 'embraer'].includes(profile.fleetGroup)) missingFields.push('fleetGroup');
  if (missingFields.length) {
    const unique = [...new Set(missingFields)];
    throw new RegulatoryError('MISSING_PROFILE_DATA', `Faltam dados de perfil que alteram a conclusão: ${unique.join(', ')}.`, { missingFields: unique, questions: unique.map((field) => `Informe ${field} para ${date}.`) });
  }
  return profile;
}

function validateCorpus(corpus) {
  if (!Array.isArray(corpus) || !corpus.length) throw new RegulatoryError('INVALID_CORPUS', 'O corpus normativo está vazio.');
  for (const rule of corpus) {
    const source = rule?.document;
    const locator = rule?.citation || {};
    if (!rule?.id || !rule.subject || !source?.official || !source?.type || !source?.title || !source?.effectiveFrom || (!source?.uri && !source?.identifier) || !locator.page || (!locator.clause && !locator.article)) {
      throw new RegulatoryError('INVALID_CORPUS', `Regra ${rule?.id || 'sem id'} não possui fonte oficial completa.`);
    }
  }
}

function scopeMatches(scope = {}, profile) {
  const matches = (values, actual) => !values?.length || values.includes('*') || values.includes(actual);
  return matches(scope.companies, profile.company)
    && matches(scope.roles, profile.role)
    && matches(scope.fleetGroups, profile.fleetGroup)
    && matches(scope.contractualBases, profile.contractualBase)
    && matches(scope.contractualAirports, profile.contractualAirport)
    && matches(scope.virtualBases, profile.virtualBase);
}

function selectRule(corpus, subject, profile, date) {
  const candidates = corpus.filter((rule) => rule.subject === subject && containsDate(rule.document, date) && scopeMatches(rule.scope, profile));
  if (!candidates.length) throw new RegulatoryError('NO_APPLICABLE_RULE', 'Nenhuma regra oficial vigente e aplicável foi encontrada.', { subject });
  const mandatory = candidates.filter((rule) => rule.mandatory && ['LAW', 'RBAC'].includes(rule.document.type));
  const pool = mandatory.length ? mandatory : candidates;
  pool.sort((left, right) => (NON_IMPERATIVE_PRIORITY[right.document.type] || 0) - (NON_IMPERATIVE_PRIORITY[left.document.type] || 0));
  return pool[0];
}

function publicSource(rule) {
  return {
    document: rule.document.title, documentType: rule.document.type,
    clause: rule.citation.clause, article: rule.citation.article, page: rule.citation.page,
    uri: rule.document.uri || null, identifier: rule.document.identifier || null,
    effectiveFrom: rule.document.effectiveFrom, effectiveTo: rule.document.effectiveTo || null,
    contentSha256: rule.document.contentSha256 || null,
  };
}

function answerStandby(rule, profile, facts) {
  if (!Number.isInteger(facts.contractualBaseAirportCount) || facts.contractualBaseAirportCount < 1) {
    throw new RegulatoryError('MISSING_DECISIVE_FACT', 'A quantidade de aeroportos da base contratual altera a janela de apresentação.', { missingFields: ['contractualBaseAirportCount'], questions: ['A base contratual fica em município ou conurbação com dois ou mais aeroportos?'] });
  }
  const multiAirport = facts.contractualBaseAirportCount >= 2;
  const configured = multiAirport ? rule.value.multiAirportMinutes : rule.value.defaultMinutes;
  const minutes = Number.isFinite(rule.value.minutes)
    ? (rule.effect === 'maximum' && Number.isFinite(configured) ? Math.min(configured, rule.value.minutes) : rule.value.minutes)
    : configured;
  return {
    result: { minutes, multiAirport },
    explanation: `${ROLE_LABEL[profile.role]}${profile.fleetGroup ? ` ${FLEET_LABEL[profile.fleetGroup]}` : ''}: a janela é de ${minutes} minutos porque a base contratual informada ${multiAirport ? 'tem dois ou mais aeroportos' : 'tem um aeroporto'}.`,
    calculation: { formula: multiAirport ? 'multiAirportMinutes' : 'defaultMinutes', inputs: { contractualBaseAirportCount: facts.contractualBaseAirportCount }, ruleValues: { minutes }, output: { minutes } },
  };
}

function answerBase(rule, profile, facts) {
  const airport = String(facts.operationAirport || '').trim().toUpperCase();
  if (!airport) throw new RegulatoryError('MISSING_DECISIVE_FACT', 'O aeroporto da operação é necessário.', { missingFields: ['operationAirport'], questions: ['Em qual aeroporto a programação começa ou termina?'] });
  const isContractualBase = airport === String(profile.contractualAirport).toUpperCase();
  const isVirtualBase = Boolean(profile.virtualBase) && airport === String(profile.virtualBase).toUpperCase();
  return {
    result: { operationAirport: airport, isContractualBase, isVirtualBase },
    explanation: isVirtualBase && !isContractualBase ? `${airport} está cadastrado como base virtual e não equivale automaticamente à base contratual ${profile.contractualAirport}.` : `${airport} ${isContractualBase ? 'é' : 'não é'} o aeroporto contratual vigente do perfil.`,
    calculation: { formula: 'operationAirport === contractualAirport; operationAirport === virtualBase', inputs: { operationAirport: airport, contractualAirport: profile.contractualAirport, virtualBase: profile.virtualBase || null }, ruleValues: rule.value, output: { isContractualBase, isVirtualBase } },
  };
}

export function createRegulatoryEngine({ corpus }) {
  validateCorpus(corpus);
  const immutableCorpus = structuredClone(corpus);
  return Object.freeze({
    answer(request = {}) {
      const kind = request.intent?.kind;
      if (!SUPPORTED_INTENTS.has(kind)) throw new RegulatoryError('UNSUPPORTED_INTENT', 'O Concierge não possui motor determinístico para essa intenção.', { supportedIntents: [...SUPPORTED_INTENTS] });
      const date = civilDate(request.at, 'at');
      const profile = resolveProfileAt(request.profileHistory, date);
      const rule = selectRule(immutableCorpus, kind, profile, date);
      const computed = kind === 'standby_callout_window' ? answerStandby(rule, profile, request.facts || {}) : answerBase(rule, profile, request.facts || {});
      const source = publicSource(rule);
      return {
        status: 'answered', intent: kind, asOf: date, profile,
        authority: { ruleId: rule.id, documentType: rule.document.type, mandatory: Boolean(rule.mandatory) },
        ...computed, sources: [source],
        actions: [{ kind: 'view_source', label: 'Ver fonte', source }, { kind: 'show_calculation', label: 'Mostrar cálculo', calculation: computed.calculation }],
      };
    },
  });
}

export function modelStandbyActivation({ standby, activation }) {
  if (!standby?.id || !/^HSBE?$/i.test(standby.kind || '') || !activation?.id || !['flight', 'reserve'].includes(activation.kind)) {
    throw new RegulatoryError('INVALID_ACTIVATION', 'HSB e acionamento real precisam estar identificados.');
  }
  return {
    complianceReference: { ...structuredClone(standby), activationId: activation.id, activated: true },
    operationalReference: { ...structuredClone(activation), sourceStandbyId: standby.id },
  };
}
