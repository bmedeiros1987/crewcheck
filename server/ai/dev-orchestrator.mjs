import { createHash } from 'node:crypto';

const ALLOWED_INPUT_TYPES = new Set(['diff', 'test', 'log', 'documentation']);
const FORBIDDEN_KEY = /(?:secret|token|password|authorization|cookie|api[_-]?key|private[_-]?key|roster|crewlife|fem|regulat|compliance|apz|cpf|email|phone|name|employee|registration|health|medical|cycle|fertil|menstru|sexual)/i;
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:sk|pk|rk|AIzaSy|gh[opusr]_|github_pat_|xox[baprs]-)[A-Za-z0-9_\-.]{12,}\b/i,
  /\b(?:authorization|api[_-]?key|token|password|secret)\s*[:=]\s*['"]?[^\s,'"}]{8,}/i,
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/,
  /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/,
];
const RAW_OPERATIONAL_PATTERNS = [
  /\b(?:raw|brut[oa]|dump|export)\b.{0,40}\b(?:roster|escala|crewlife|crew life|fem|compliance|regulat[oó]ri[oa]|apz)\b/i,
  /\b(?:roster|escala|crewlife|crew life|fem|compliance|regulat[oó]ri[oa]|apz)\b.{0,40}\b(?:raw|brut[oa]|dump|export)\b/i,
  /\b(?:fertilidade|menstrua(?:ção|l)?|ovula(?:ção|l)?|sexualidade)\b/i,
  /\b[A-Z]{2}\s?\d{3,4}\b.*\b(?:STD|STA|DEP|ARR|OFF|ON)\b/i,
];
const MAX_INPUT_CHARS = 80_000;
const MAX_ITEM_CHARS = 30_000;

export class AiDevInputError extends Error {
  constructor(message, code = 'ai_dev_input_blocked') {
    super(message);
    this.name = 'AiDevInputError';
    this.code = code;
  }
}

function normalizedText(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

function assertSafeText(text) {
  if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) {
    throw new AiDevInputError('Input contains a secret or direct personal identifier.', 'secret_or_identifier_detected');
  }
  if (RAW_OPERATIONAL_PATTERNS.some((pattern) => pattern.test(text))) {
    throw new AiDevInputError('Raw operational, regulatory, CrewLife or Fem data is not accepted.', 'raw_operational_data_detected');
  }
}

export function sanitizeAiDevInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AiDevInputError('Input must be an object.');
  if (Object.keys(input).some((key) => FORBIDDEN_KEY.test(key))) throw new AiDevInputError('Input contains a forbidden field.', 'forbidden_field');
  const items = Array.isArray(input.items) ? input.items : [];
  if (items.length === 0) throw new AiDevInputError('At least one sanitized artifact is required.', 'empty_input');

  let total = 0;
  const sanitizedItems = items.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new AiDevInputError(`Artifact ${index} must be an object.`);
    if (Object.keys(item).some((key) => !['type', 'content', 'label'].includes(key) || FORBIDDEN_KEY.test(key))) {
      throw new AiDevInputError(`Artifact ${index} contains a forbidden field.`, 'forbidden_field');
    }
    if (!ALLOWED_INPUT_TYPES.has(item.type)) throw new AiDevInputError(`Artifact ${index} has an unsupported type.`, 'unsupported_input_type');
    const content = normalizedText(item.content);
    if (!content || content.length > MAX_ITEM_CHARS) throw new AiDevInputError(`Artifact ${index} is empty or too large.`, 'invalid_input_size');
    assertSafeText(content);
    total += content.length;
    const label = normalizedText(item.label);
    assertSafeText(label);
    return { type: item.type, label: label.slice(0, 120), content };
  });
  if (total > MAX_INPUT_CHARS) throw new AiDevInputError('Combined input is too large.', 'invalid_input_size');

  const rawObjective = normalizedText(input.objective);
  assertSafeText(rawObjective);
  return { objective: rawObjective.slice(0, 500), items: sanitizedItems };
}

export function buildAiDevPrompt(input) {
  return [
    'You are an advisory software engineering reviewer. Never authorize merge or replace CI, tests, security or compliance gates.',
    'Analyze only the sanitized artifacts below. Do not infer or request user, roster, health, CrewLife/Fem, secret, or raw regulatory data.',
    'Return strict JSON with arrays: findings, risks, suggestions, evidence. Each finding/risk/suggestion must have a concise text field; evidence entries must also include an artifact label.',
    `Objective: ${input.objective || 'Review the supplied engineering artifacts.'}`,
    ...input.items.map((item, index) => `--- artifact ${index + 1}: ${item.type} ${item.label || ''}\n${item.content}`),
  ].join('\n');
}

function parseProviderReport(text) {
  const source = normalizedText(text).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const value = JSON.parse(source);
    const list = (name) => Array.isArray(value?.[name]) ? value[name].map((entry) => typeof entry === 'string' ? { text: entry } : entry).filter((entry) => entry?.text).slice(0, 30) : [];
    return { findings: list('findings'), risks: list('risks'), suggestions: list('suggestions'), evidence: list('evidence') };
  } catch {
    return { findings: [], risks: [{ text: 'Provider returned an invalid structured report.' }], suggestions: [], evidence: [] };
  }
}

function fingerprint(text) {
  return createHash('sha256').update(normalizedText(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')).digest('hex').slice(0, 16);
}

function withProviders(reports, section) {
  const groups = new Map();
  for (const report of reports) for (const item of report[section]) {
    const key = fingerprint(item.text);
    const current = groups.get(key) || { text: item.text, providers: [], evidence: item.artifact || null };
    current.providers.push(report.provider);
    groups.set(key, current);
  }
  return [...groups.values()];
}

export function consolidateAiDevReports(reports, attemptedProviders) {
  const findings = withProviders(reports, 'findings');
  const consensus = findings.filter((item) => item.providers.length > 1);
  const divergences = findings.filter((item) => item.providers.length === 1);
  return {
    advisoryOnly: true,
    mergeAuthorized: false,
    gatesReplaced: false,
    providers: { attempted: attemptedProviders, completed: reports.map((report) => report.provider) },
    consensus,
    divergences,
    risks: withProviders(reports, 'risks'),
    suggestions: withProviders(reports, 'suggestions'),
    evidence: withProviders(reports, 'evidence'),
  };
}

export class AiDevOrchestrator {
  constructor({ providers = [], timeoutMs = 30_000 } = {}) {
    this.providers = providers;
    this.timeoutMs = timeoutMs;
  }

  async analyze(rawInput) {
    const input = sanitizeAiDevInput(rawInput);
    const prompt = buildAiDevPrompt(input);
    const eligible = this.providers.filter((provider) => provider.enabled);
    const reports = await Promise.all(eligible.map(async (provider) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const timeout = new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(Object.assign(new Error('Provider timed out.'), { code: 'provider_timeout' })), { once: true });
        });
        const result = await Promise.race([
          provider.generate({ prompt, domain: 'engineering-advisory', context: {} }, { signal: controller.signal }),
          timeout,
        ]);
        return { provider: provider.id, ...parseProviderReport(result?.text) };
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    }));
    return consolidateAiDevReports(reports.filter(Boolean), eligible.map((provider) => provider.id));
  }
}
