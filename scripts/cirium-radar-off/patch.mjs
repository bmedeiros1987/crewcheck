const imports = "import { defaultCiriumRadarOptions, ciriumRadarInjectionEnabled, ciriumRadarRegistration, ciriumRadarIdentity, runCiriumRadarInjection, ciriumRadarProjection } from './server/cirium-radar-injection.mjs';\n";
export function patchCiriumRadarOff(source) {
  const previous = imports.replace('defaultCiriumRadarOptions, ', '');
  if (source.includes(previous)) {
    source = source.replace(previous, imports);
    const marker = "  const ctx = buildFlightContext(url.searchParams.get('flight') || '');\n";
    if (source.split(marker).length !== 2) throw Error('Sky OFF handler anchor changed');
    source = source.replace(marker, marker + '  radarOptions = { ...radarOptions, cirium: radarOptions.cirium || defaultCiriumRadarOptions() };\n');
  }
  if (source.includes(imports)) {
    for (const required of ['...ciriumRadarProjection(item)', 'ciriumRadarRegistration(),', 'await runCiriumRadarInjection(',
      "payload.provider === 'cirium-sky'", 'radarOptions = {}', 'ctx.ciriumRadarIdentity = ciriumRadarIdentity(url.searchParams)', 'cirium: radarOptions.cirium || defaultCiriumRadarOptions()']) {
      if (!source.includes(required)) throw Error(`Incomplete Cirium OFF wiring: ${required}`);
    }
    return source;
  }
  function replace(marker, replacement) {
    if (source.split(marker).length !== 2) throw Error(`Cirium OFF wiring anchor changed: ${marker}`);
    source = source.replace(marker, replacement);
  }
  source = imports + source;
  replace('function publicRadarPayload(item = {}) {\n  return {', 'function publicRadarPayload(item = {}) {\n  return {\n    ...ciriumRadarProjection(item),');
  replace('function configuredProviders() {\n  return [', 'function configuredProviders() {\n  return [\n    ciriumRadarRegistration(),');
  const race = source.match(/async function runRadarRace\(ctx, origin, destination(?:, scheduledDeparture = '')?\) \{\n/);
  if (!race) throw Error('Cirium OFF wiring: Radar race signature changed');
  replace(race[0], race[0] + `  if (ciriumRadarInjectionEnabled(ctx.ciriumRadarOptions)) {\n    const result = await runCiriumRadarInjection(ctx.ciriumRadarIdentity, ctx.ciriumRadarOptions, ctx.raw);\n    return publicRadarPayload(result);\n  }\n`);
  replace('async function handleRadar(req, res, url) {', 'async function handleRadar(req, res, url, radarOptions = {}) {');
  replace("  const ctx = buildFlightContext(url.searchParams.get('flight') || '');", "  const ctx = buildFlightContext(url.searchParams.get('flight') || '');\n  radarOptions = { ...radarOptions, cirium: radarOptions.cirium || defaultCiriumRadarOptions() };\n  if (ciriumRadarInjectionEnabled(radarOptions.cirium)) {\n    ctx.ciriumRadarOptions = radarOptions.cirium;\n    ctx.ciriumRadarIdentity = ciriumRadarIdentity(url.searchParams);\n  }");
  replace('  const radarUser = telegramRequestUser(req,', "  if (payload.provider === 'cirium-sky') return sendJson(res, 200, { ...payload, exportedToConcierge: false });\n  const radarUser = telegramRequestUser(req,");
  return source;
}
