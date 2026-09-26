import { readBody, sendJson } from '../v139/common.mjs';
import { createRegulatoryEngine, RegulatoryError } from './engine.mjs';
import { OFFICIAL_REGULATORY_CORPUS } from './official-corpus.mjs';

const engine = createRegulatoryEngine({ corpus: OFFICIAL_REGULATORY_CORPUS });

export async function handleRegulatoryRoute(req, res, url) {
  if (url.pathname !== '/api/regulatory/concierge') return false;
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' });
    return true;
  }
  try {
    const answer = engine.answer(await readBody(req, 250_000));
    sendJson(res, 200, { ok: true, answer });
  } catch (error) {
    const known = error instanceof RegulatoryError;
    sendJson(res, known ? 422 : 500, {
      ok: false,
      code: known ? error.code : 'REGULATORY_ENGINE_ERROR',
      message: known ? error.message : 'O motor regulatório não conseguiu concluir a análise.',
      missingFields: known ? error.missingFields || [] : [],
      questions: known ? error.questions || [] : [],
    });
  }
  return true;
}

