import fs from 'node:fs';

const VERSION = '14.4.09';

function update(filePath, transform) {
  if (!fs.existsSync(filePath)) throw new Error(`[v14409] arquivo ausente: ${filePath}`);
  const before = fs.readFileSync(filePath, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(filePath, after, 'utf8');
  return after;
}

const server = update('server.mjs', (source) => {
  let next = source;

  if (!next.includes("from './server/cirium-diagnostic.mjs'")) {
    const importBoundary = '\n\nconst __dirname =';
    if (!next.includes(importBoundary)) throw new Error('[v14409] fronteira de imports do servidor não localizada.');
    next = next.replace(
      importBoundary,
      `\nimport { ciriumConfiguration } from './server/cirium-diagnostic.mjs';\nimport { normalizeCiriumFlightStatus } from './server/cirium-flight-adapter.mjs';${importBoundary}`,
    );
  }

  if (!next.includes('provider: firstKnown(item.provider)')) {
    const payloadAnchor = '    configured: Boolean(item.configured),\n    flight: firstKnown(item.flight, item.ident),';
    if (!next.includes(payloadAnchor)) throw new Error('[v14409] payload público do radar não localizado.');
    next = next.replace(
      payloadAnchor,
      '    configured: Boolean(item.configured),\n    provider: firstKnown(item.provider),\n    flight: firstKnown(item.flight, item.ident),',
    );
  }

  if (!next.includes('arrivalGate: firstKnown(item.arrivalGate)')) {
    const terminalAnchor = '    terminal: firstKnown(item.terminal),\n    departure: firstKnown(item.departure),';
    if (!next.includes(terminalAnchor)) throw new Error('[v14409] campos de terminal do radar não localizados.');
    next = next.replace(
      terminalAnchor,
      '    terminal: firstKnown(item.terminal),\n    arrivalGate: firstKnown(item.arrivalGate),\n    arrivalTerminal: firstKnown(item.arrivalTerminal),\n    baggage: firstKnown(item.baggage),\n    departure: firstKnown(item.departure),',
    );
  }

  if (!next.includes('state.requests = Number(state.requests || 0) + 1;')) {
    const oldMarkProvider = `function markProvider(name, ok) {\n  const state = radarHealth.get(name) || {};\n  if (ok) state.lastOk = Date.now();\n  else state.lastFail = Date.now();\n  radarHealth.set(name, state);\n}`;
    const newMarkProvider = `function markProvider(name, ok, meta = {}) {\n  const state = radarHealth.get(name) || {};\n  const now = Date.now();\n  state.requests = Number(state.requests || 0) + 1;\n  state.lastRequest = now;\n  if (ok) state.lastOk = now;\n  else state.lastFail = now;\n  if (Number.isFinite(Number(meta.httpStatus))) state.lastHttpStatus = Number(meta.httpStatus);\n  if (Number.isFinite(Number(meta.latencyMs))) state.lastLatencyMs = Math.max(0, Math.round(Number(meta.latencyMs)));\n  radarHealth.set(name, state);\n}`;
    if (!next.includes(oldMarkProvider)) throw new Error('[v14409] markProvider legado não localizado.');
    next = next.replace(oldMarkProvider, newMarkProvider);
  }

  if (!next.includes('async function providerCirium(')) {
    const configuredAnchor = 'function configuredProviders() {';
    if (!next.includes(configuredAnchor)) throw new Error('[v14409] configuredProviders não localizado.');
    const ciriumProvider = `function ciriumRadarCarrier(ctx, explicitCarrier = '') {\n  const explicit = String(explicitCarrier || '').trim().toUpperCase();\n  if (/^[A-Z0-9]{2,3}$/.test(explicit) && /[A-Z]/.test(explicit)) return explicit;\n  const flight = String(ctx?.iata || ctx?.raw || '').trim().toUpperCase();\n  const match = flight.match(/^([A-Z0-9]{2})(\\d{1,5}[A-Z]?)$/);\n  if (match && /[A-Z]/.test(match[1])) return match[1];\n  return /^\\d{1,5}[A-Z]?$/.test(flight) ? 'LA' : '';\n}\nfunction ciriumRadarFlightNumber(ctx) {\n  return String(ctx?.iata || ctx?.raw || '').trim().toUpperCase().match(/(\\d{1,5}[A-Z]?)$/)?.[1] || '';\n}\nfunction ciriumRadarDate(value = '', scheduledDeparture = '') {\n  const candidate = String(value || '').trim();\n  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(candidate)) {\n    const parsed = new Date(\`${'${candidate}'}T12:00:00Z\`);\n    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate) return candidate;\n  }\n  const scheduled = new Date(String(scheduledDeparture || ''));\n  if (!Number.isNaN(scheduled.getTime())) {\n    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(scheduled);\n  }\n  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());\n}\nasync function providerCirium(ctx, timeoutMs, origin, destination, scheduledDeparture = '', radarQuery = {}) {\n  const config = ciriumConfiguration();\n  if (!config.configured || !providerAvailable('cirium', ['CIRIUM_SKY_API_TOKEN', 'CIRIUM_SKY_SECRET', 'CIRIUM_APP_ID', 'CIRIUM_APP_KEY'])) return null;\n  const carrier = ciriumRadarCarrier(ctx, radarQuery.carrier);\n  const flightNumber = ciriumRadarFlightNumber(ctx);\n  if (!carrier || !flightNumber) return null;\n  const date = ciriumRadarDate(radarQuery.date, scheduledDeparture);\n  const started = Date.now();\n  let url;\n  let headers = { accept: 'application/json' };\n\n  if (config.mode === 'sky') {\n    url = new URL(\`${'${config.baseUrl}'}/v1/flights/status/airline/${'${encodeURIComponent(carrier)}'}/flight-number/${'${encodeURIComponent(flightNumber)}'}/departure-date/${'${date}'}\`);\n    url.searchParams.set('extendedOptions', 'includeDeltas,includeNewFields');\n    headers = { ...headers, authorization: config.token };\n  } else {\n    const [year, month, day] = date.split('-').map(Number);\n    url = new URL(\`https://api.flightstats.com/flex/flightstatus/rest/v2/json/flight/status/${'${encodeURIComponent(carrier)}'}/${'${encodeURIComponent(flightNumber)}'}/dep/${'${year}'}/${'${month}'}/${'${day}'}\`);\n    url.searchParams.set('appId', config.appId);\n    url.searchParams.set('appKey', config.appKey);\n    url.searchParams.set('extendedOptions', 'useHttpErrors');\n  }\n\n  try {\n    const { response, payload } = await jsonFetch(url, { headers, redirect: 'error' }, timeoutMs);\n    const latencyMs = Date.now() - started;\n    markProvider('cirium', response.ok, { httpStatus: response.status, latencyMs });\n    if (!response.ok) {\n      return { ok: false, configured: true, provider: config.provider, latencyMs, message: 'Cirium configurado, mas sem resposta operacional agora.' };\n    }\n\n    const rows = Array.isArray(payload?.flightStatuses)\n      ? payload.flightStatuses\n      : payload?.flightStatus && typeof payload.flightStatus === 'object'\n        ? [payload.flightStatus]\n        : [];\n    const wantedOrigin = radarAirportCode(origin);\n    const wantedDestination = radarAirportCode(destination);\n    const routeMatch = rows.find((row) => {\n      const departure = radarAirportCode(row?.departureAirportFsCode);\n      const arrival = radarAirportCode(row?.arrivalAirportFsCode);\n      return (!wantedOrigin || !departure || departure === wantedOrigin) && (!wantedDestination || !arrival || arrival === wantedDestination);\n    });\n    const row = routeMatch || rows.find((item) => item?.status !== 'C') || rows[0];\n    if (!row) {\n      return { ok: false, configured: true, provider: config.provider, latencyMs, message: 'Voo não localizado no Cirium para a ocorrência consultada.' };\n    }\n\n    const normalized = normalizeCiriumFlightStatus(row, { carrier, flightNumber, origin, destination });\n    return { ...normalized, flight: ctx.raw || normalized.flight, latencyMs, provider: config.provider, message: 'Radar atualizado via Cirium.' };\n  } catch (error) {\n    const latencyMs = Date.now() - started;\n    markProvider('cirium', false, { latencyMs });\n    return {\n      ok: false,\n      configured: true,\n      provider: config.provider,\n      latencyMs,\n      message: error?.name === 'AbortError' ? 'Cirium excedeu a janela operacional do radar.' : 'Cirium temporariamente indisponível.',\n    };\n  }\n}\n`;
    next = next.replace(configuredAnchor, `${ciriumProvider}\n${configuredAnchor}`);
  }

  if (!next.includes("{ key: 'cirium', available: Boolean(cirium.configured), mode: cirium.mode }")) {
    const configuredHeader = `function configuredProviders() {\n  return [`;
    const configuredReplacement = `function configuredProviders() {\n  const cirium = ciriumConfiguration();\n  return [\n    { key: 'cirium', available: Boolean(cirium.configured), mode: cirium.mode },`;
    if (!next.includes(configuredHeader)) throw new Error('[v14409] início de configuredProviders não localizado.');
    next = next.replace(configuredHeader, configuredReplacement);
  }

  if (!next.includes('async function runRadarRace(ctx, origin, destination, scheduledDeparture = \'\', radarQuery = {})')) {
    const raceSignature = "async function runRadarRace(ctx, origin, destination, scheduledDeparture = '') {";
    if (!next.includes(raceSignature)) throw new Error('[v14409] assinatura preparada de runRadarRace não localizada.');
    next = next.replace(raceSignature, "async function runRadarRace(ctx, origin, destination, scheduledDeparture = '', radarQuery = {}) {");
  }

  const raceStart = next.indexOf('async function runRadarRace(');
  const raceEnd = next.indexOf('\nasync function handleRadar(', raceStart + 1);
  if (raceStart < 0 || raceEnd < 0) throw new Error('[v14409] escopo de runRadarRace não localizado.');
  const raceScope = next.slice(raceStart, raceEnd);
  if (!raceScope.includes('providerCirium(ctx, timeoutMs, origin, destination, scheduledDeparture, radarQuery)')) {
    const providerAnchor = '  const providers = [\n    () => providerFlightAware(ctx, timeoutMs, origin, destination, scheduledDeparture),';
    if (!next.includes(providerAnchor)) throw new Error('[v14409] lista preparada de provedores do radar não localizada.');
    next = next.replace(
      providerAnchor,
      '  const providers = [\n    () => providerCirium(ctx, timeoutMs, origin, destination, scheduledDeparture, radarQuery),\n    () => providerFlightAware(ctx, timeoutMs, origin, destination, scheduledDeparture),',
    );
  }

  if (!next.includes("const carrier = String(url.searchParams.get('carrier') || '').trim().toUpperCase();")) {
    const scheduledAnchor = "  const scheduledDeparture = String(url.searchParams.get('scheduledDeparture') || '').trim();";
    if (!next.includes(scheduledAnchor)) throw new Error('[v14409] scheduledDeparture preparado não localizado.');
    next = next.replace(
      scheduledAnchor,
      `${scheduledAnchor}\n  const carrier = String(url.searchParams.get('carrier') || '').trim().toUpperCase();\n  const date = String(url.searchParams.get('date') || '').trim();`,
    );
  }

  if (!next.includes('runRadarRace(ctx, origin, destination, scheduledDeparture, { carrier, date })')) {
    const callAnchor = '  const payload = await runRadarRace(ctx, origin, destination, scheduledDeparture);';
    if (!next.includes(callAnchor)) throw new Error('[v14409] chamada preparada de runRadarRace não localizada.');
    next = next.replace(callAnchor, '  const payload = await runRadarRace(ctx, origin, destination, scheduledDeparture, { carrier, date });');
  }

  if (!next.includes('const providerStates = configured.map((item) => {')) {
    const healthAnchor = `function handleRadarHealth(req, res) {\n  const configured = configuredProviders();`;
    const healthReplacement = `function handleRadarHealth(req, res) {\n  const configured = configuredProviders();\n  const providerStates = configured.map((item) => {\n    const state = radarHealth.get(item.key) || {};\n    const iso = (value) => value ? new Date(value).toISOString() : null;\n    return {\n      key: item.key,\n      available: Boolean(item.available),\n      mode: item.mode || null,\n      requests: Number(state.requests || 0),\n      lastRequestAt: iso(state.lastRequest),\n      lastOkAt: iso(state.lastOk),\n      lastFailAt: iso(state.lastFail),\n      lastHttpStatus: Number.isFinite(Number(state.lastHttpStatus)) ? Number(state.lastHttpStatus) : null,\n      lastLatencyMs: Number.isFinite(Number(state.lastLatencyMs)) ? Number(state.lastLatencyMs) : null,\n    };\n  });`;
    if (!next.includes(healthAnchor)) throw new Error('[v14409] radar health não localizado.');
    next = next.replace(healthAnchor, healthReplacement);
  }

  if (!next.includes('    providers: providerStates,')) {
    const healthMessageAnchor = `    configured: configured.filter((item) => item.available).length,\n    message:`;
    if (!next.includes(healthMessageAnchor)) throw new Error('[v14409] payload do radar health não localizado.');
    next = next.replace(
      healthMessageAnchor,
      `    configured: configured.filter((item) => item.available).length,\n    providers: providerStates,\n    message:`,
    );
  }

  return next;
});

const home = update('client/src/pages/Home.tsx', (source) => {
  let next = source;
  if (!next.includes('new URLSearchParams({ flight, carrier, date: eventDate')) {
    const paramsAnchor = "  const params = new URLSearchParams({ flight, origin: String(event.origin || ''), destination: String(event.destination || ''), scheduledDeparture, force: force ? '1' : '0', email: identity.email, name: identity.name, conciergeKey: identity.conciergeKey });";
    const paramsReplacement = "  const carrier = String(event.airlineCode || normalizedAirlineCode(flight) || 'LA').trim().toUpperCase();\n  const eventDate = radarEventOperationalDate(event);\n  const params = new URLSearchParams({ flight, carrier, date: eventDate, origin: String(event.origin || ''), destination: String(event.destination || ''), scheduledDeparture, force: force ? '1' : '0', email: identity.email, name: identity.name, conciergeKey: identity.conciergeKey });";
    if (!next.includes(paramsAnchor)) throw new Error('[v14409] chamada preparada do radar no Home não localizada.');
    next = next.replace(paramsAnchor, paramsReplacement);
  }
  return next;
});

for (const required of [
  "import { ciriumConfiguration } from './server/cirium-diagnostic.mjs';",
  "import { normalizeCiriumFlightStatus } from './server/cirium-flight-adapter.mjs';",
  'async function providerCirium(',
  "markProvider('cirium'",
  'provider: firstKnown(item.provider)',
  "{ key: 'cirium', available: Boolean(cirium.configured), mode: cirium.mode }",
  'providerCirium(ctx, timeoutMs, origin, destination, scheduledDeparture, radarQuery)',
  'runRadarRace(ctx, origin, destination, scheduledDeparture, { carrier, date })',
  'providers: providerStates',
]) {
  if (!server.includes(required)) throw new Error(`[v14409] contrato Cirium ausente no servidor: ${required}`);
}
for (const required of [
  'const eventDate = radarEventOperationalDate(event);',
  "const carrier = String(event.airlineCode || normalizedAirlineCode(flight) || 'LA')",
  'new URLSearchParams({ flight, carrier, date: eventDate',
  'scheduledDeparture',
]) {
  if (!home.includes(required)) throw new Error(`[v14409] contrato Cirium ausente no cliente: ${required}`);
}

console.log(`[v14409] CrewCheck ${VERSION}: Cirium participa do Radar ao vivo, preservando identidade da ocorrência e telemetria sanitizada por provedor.`);
