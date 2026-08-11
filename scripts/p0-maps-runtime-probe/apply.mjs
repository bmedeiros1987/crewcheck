import fs from 'node:fs';

const MARKER = 'p0-maps-runtime-probe';
const file = 'server.mjs';
if (!fs.existsSync(file)) throw new Error(`[${MARKER}] server.mjs ausente`);
let source = fs.readFileSync(file, 'utf8');

const oldGoogleFailure = `  if (!result.ok || !route) return { ok: false, configured: true, googleFailure: true, mapsBudget: await googleMapsBudgetStatus(), message: 'Google Routes não respondeu.' };`;
const newGoogleFailure = `  if (!result.ok || !route) return {\n    ok: false,\n    configured: true,\n    googleFailure: true,\n    httpStatus: Number(result.status) || null,\n    failureClass: result.status === 401 || result.status === 403\n      ? 'auth_or_restriction'\n      : result.status === 400\n        ? 'request_or_api'\n        : result.status >= 500\n          ? 'provider_unavailable'\n          : 'unknown',\n    mapsBudget: await googleMapsBudgetStatus(),\n    message: 'Google Routes não respondeu.',\n  };`;
if (!source.includes(newGoogleFailure)) {
  if (!source.includes(oldGoogleFailure)) throw new Error(`[${MARKER}] falha Google não localizada`);
  source = source.replace(oldGoogleFailure, newGoogleFailure);
}

const oldQuotaReturn = `    return { ok: false, configured: true, quotaFailure: true, mapsBudget: blocked, message: 'Cota do Google Maps indisponível.' };`;
const newQuotaReturn = `    return { ok: false, configured: true, quotaFailure: true, failureClass: 'quota', httpStatus: Number(result.status) || null, mapsBudget: blocked, message: 'Cota do Google Maps indisponível.' };`;
if (!source.includes(newQuotaReturn)) {
  if (!source.includes(oldQuotaReturn)) throw new Error(`[${MARKER}] retorno de quota Google não localizado`);
  source = source.replace(oldQuotaReturn, newQuotaReturn);
}

const oldHandler = `async function handleMapsProviderStatus(req, res) {\n  const identity = alarmRequestIdentity(req);\n  if (!identity.admin) return sendJson(res, 403, { ok: false, message: 'Controle mensal de mapas disponível somente no Admin.' });\n  const budget = await googleMapsBudgetStatus();\n  const googleConfigured = Boolean(mapsServerKey());\n  const tomtomConfigured = Boolean(tomtomServerKey());\n  return sendJson(res, 200, {\n    ok: googleConfigured || tomtomConfigured,\n    primary: tomtomConfigured ? 'TomTom' : googleConfigured && !budget.blocked ? 'Google Routes' : 'Indisponível',\n    fallback: tomtomConfigured && googleConfigured && !budget.blocked ? 'Google Routes' : null,\n    googleConfigured,\n    tomtomConfigured,\n    budget,\n    message: tomtomConfigured\n      ? 'TomTom é o provedor principal para carro; Google Routes permanece como contingência e transporte público.'\n      : budget.blocked\n        ? 'Google Maps pausado até a próxima competência; rota terrestre indisponível sem TomTom.'\n        : \`Google Routes ativo como contingência: \${budget.used} de \${budget.limit} solicitações usadas neste mês.\`,\n  });\n}`;

const newHandler = `function sanitizedMapsProbe(provider, configured, result) {\n  if (!configured) return { provider, configured: false, state: 'not_configured' };\n  if (!result) return { provider, configured: true, state: 'unavailable' };\n  const distanceMeters = Number(result.distanceMeters);\n  const durationSeconds = Number(result.durationSeconds);\n  const routeValid = result.ok === true && Number.isFinite(distanceMeters) && distanceMeters > 0 && Number.isFinite(durationSeconds) && durationSeconds > 0;\n  return {\n    provider,\n    configured: true,\n    state: routeValid ? 'available' : result.failureClass === 'quota' || result.quotaFailure || result.budgetDenied ? 'quota' : result.failureClass || 'unavailable',\n    httpStatus: Number(result.httpStatus) || undefined,\n    routeValid,\n    liveTraffic: routeValid ? Boolean(result.liveTraffic || result.trafficAware) : false,\n    updatedAt: routeValid ? result.updatedAt || new Date().toISOString() : undefined,\n  };\n}\n\nasync function handleMapsProviderStatus(req, res) {\n  const identity = alarmRequestIdentity(req);\n  if (!identity.admin) return sendJson(res, 403, { ok: false, message: 'Controle mensal de mapas disponível somente no Admin.' });\n  const budget = await googleMapsBudgetStatus();\n  const googleKey = mapsServerKey();\n  const tomtomKey = tomtomServerKey();\n  const googleConfigured = Boolean(googleKey);\n  const tomtomConfigured = Boolean(tomtomKey);\n  const status = {\n    ok: googleConfigured || tomtomConfigured,\n    primary: tomtomConfigured ? 'TomTom' : googleConfigured && !budget.blocked ? 'Google Routes' : 'Indisponível',\n    fallback: tomtomConfigured && googleConfigured && !budget.blocked ? 'Google Routes' : null,\n    googleConfigured,\n    tomtomConfigured,\n    budget,\n    probeAvailable: true,\n    message: tomtomConfigured\n      ? 'TomTom é o provedor principal para carro; Google Routes permanece como contingência e transporte público.'\n      : budget.blocked\n        ? 'Google Maps pausado até a próxima competência; rota terrestre indisponível sem TomTom.'\n        : \`Google Routes ativo como contingência: \${budget.used} de \${budget.limit} solicitações usadas neste mês.\`,\n  };\n\n  const requestUrl = new URL(req.url || '/api/maps/provider/status', 'https://crewcheck.local');\n  if (requestUrl.searchParams.get('probe') !== '1') return sendJson(res, 200, status);\n\n  const origin = 'Aeroporto Internacional de Brasília, Brasília - DF';\n  const destination = 'ParkShopping Brasília, Brasília - DF';\n  let tomtomResult = null;\n  let googleResult = null;\n  try {\n    if (tomtomKey) tomtomResult = await tomtomRoutePreview(origin, destination, tomtomKey);\n  } catch {}\n  try {\n    if (googleKey && !budget.blocked) googleResult = await googleRoutePreview(origin, destination, 'driving', googleKey);\n  } catch {}\n\n  const providers = [\n    sanitizedMapsProbe('TomTom', tomtomConfigured, tomtomResult),\n    sanitizedMapsProbe('Google Routes', googleConfigured, googleResult),\n  ];\n  return sendJson(res, 200, {\n    ...status,\n    ok: providers.some((item) => item.state === 'available'),\n    runtimeProbe: {\n      executed: true,\n      scope: 'rota terrestre curta em Brasília',\n      providers,\n      checkedAt: new Date().toISOString(),\n      note: 'O probe é executado somente sob solicitação explícita do Admin e não expõe chaves nem payload bruto dos provedores.',\n    },\n  });\n}`;

if (!source.includes('function sanitizedMapsProbe(provider, configured, result)')) {
  if (!source.includes(oldHandler)) throw new Error(`[${MARKER}] handler de status não localizado`);
  source = source.replace(oldHandler, newHandler);
}

for (const required of [
  "probeAvailable: true",
  "requestUrl.searchParams.get('probe') !== '1'",
  "sanitizedMapsProbe('TomTom'",
  "sanitizedMapsProbe('Google Routes'",
  "failureClass: 'quota'",
  "'auth_or_restriction'",
]) {
  if (!source.includes(required)) throw new Error(`[${MARKER}] contrato ausente: ${required}`);
}

fs.writeFileSync(file, source, 'utf8');
console.log(`[${MARKER}] diagnóstico runtime explícito e sanitizado de Maps aplicado.`);
