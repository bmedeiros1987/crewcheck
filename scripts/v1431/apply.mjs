import fs from 'node:fs';

const VERSION = '14.3.1';
function update(path, transform) {
  if (!fs.existsSync(path)) return;
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}
function required(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v1431] Âncora não encontrada: ${label}`);
  return source.replace(before, after);
}

update('server/platform.mjs', (source) => {
  let next = source;

  next = required(next,
    "async function requirePremium(context, res, feature = 'Este recurso') {",
    `function planOperationalLimits(profile = {}, billing = {}) {
  const plan = String(profile?.plan || billing?.plan || 'free').toLowerCase();
  const premium = Boolean(billing?.premiumAccess || /premium|unlimited|partner|admin/.test(plan));
  return {
    premium,
    guestLimit: premium ? 5 : 1,
    meteoFavorites: premium ? 20 : 2,
    meteoFollowHours: premium ? 24 : 3,
    backgroundTrafficAlerts: premium,
    backgroundMeteoAlerts: premium,
  };
}

async function requirePremium(context, res, feature = 'Este recurso') {`,
    'limites operacionais por plano');

  next = next.replace(
    "  if (!await requirePremium(context, res, 'Modo visitante')) return;\n  if (req.method === 'POST') {",
    `  const billing = await subscriptionStatus(context.db, context.profile);
  const limits = planOperationalLimits(context.profile, billing);
  if (req.method === 'POST') {
    const countResult = await context.db.query("SELECT COUNT(*) count FROM crewcheck_platform_visitors WHERE owner_email=$1 AND status<>'revoked'", [context.identity.email]);
    const activeCount = Number(countResult.rows[0]?.count || 0);
    if (activeCount >= limits.guestLimit) return sendJson(res, 402, {
      ok: false,
      code: 'VISITOR_LIMIT_REACHED',
      limit: limits.guestLimit,
      activeCount,
      premiumAvailable: !limits.premium,
      message: limits.premium
        ? \`Seu plano permite até \${limits.guestLimit} convidados ativos. Revogue um acesso antes de criar outro.\`
        : 'O plano gratuito permite 1 convidado ativo. O Premium amplia para até 5 convidados, mantendo as mesmas informações confiáveis.',
    });`);

  next = next.replace(
    "  return sendJson(res, 200, { ok: true, visitors: result.rows });",
    "  return sendJson(res, 200, { ok: true, visitors: result.rows, limits, remaining: Math.max(0, limits.guestLimit - result.rows.filter((item) => item.status !== 'revoked').length) });");

  next = next.replace(
    "  if (!await requirePremium(context, res, 'Permissões do visitante')) return;",
    "  const billing = await subscriptionStatus(context.db, context.profile);\n  const limits = planOperationalLimits(context.profile, billing);");

  next = next.replace(
    "  if (!ownerProfile || !(await subscriptionStatus(db, ownerProfile)).premiumAccess) return sendJson(res, 402, { ok: false, code: 'OWNER_PREMIUM_REQUIRED', message: 'Este acesso está pausado porque o plano Premium do titular não está ativo.' });",
    "  if (!ownerProfile) return sendJson(res, 404, { ok: false, message: 'Titular não localizado.' });\n  const ownerBilling = await subscriptionStatus(db, ownerProfile);\n  const ownerLimits = planOperationalLimits(ownerProfile, ownerBilling);\n  const activeVisitors = await db.query(\"SELECT id FROM crewcheck_platform_visitors WHERE owner_email=$1 AND status='active' ORDER BY created_at ASC\", [identity.ownerEmail]);\n  const allowedIds = activeVisitors.rows.slice(0, ownerLimits.guestLimit).map((item) => item.id);\n  if (!allowedIds.includes(visitor.id)) return sendJson(res, 402, { ok: false, code: 'OWNER_VISITOR_LIMIT', message: 'Este acesso excede o limite atual do plano do titular. O titular pode escolher qual convidado manter ativo.' });");

  next = next.replace(
    "      'Comparação de escala, visitantes e chat interno',",
    "      'Comparação de escala, até 5 visitantes e chat interno',");
  next = next.replace(
    "      'Concierge Telegram por texto e 1 teste de ligação por mês',",
    "      'Concierge Telegram por texto e 1 teste de ligação por mês',\n      '1 convidado ativo e 2 favoritos meteorológicos',\n      'Acompanhamento METAR/TAF por até 3 horas',");
  next = next.replace(
    "      'Saída Inteligente, meteorologia e rotinas conectadas',",
    "      'Planejador de Saída com trânsito e alertas em segundo plano',\n      'Meteorologia seguida por até 24 horas e 20 favoritos',");

  next = next.replace("const APP_VERSION = '13.8.8';", `const APP_VERSION = '${VERSION}';`);
  if (!next.includes("code: 'VISITOR_LIMIT_REACHED'")) throw new Error('[v1431] Limite de convidados não foi aplicado.');
  if (!next.includes('ownerLimits.guestLimit')) throw new Error('[v1431] Acesso de visitante gratuito não foi protegido.');
  return next;
});

update('client/src/pages/Home.tsx', (source) => source
  .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
  .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: gratuito confiável com limites claros e Premium orientado a automação contínua';`));

update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - reliable free limits and premium automation boundaries`;
  data.scripts ||= {};
  data.scripts['regression:v14.3.1'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-1-plan-limits.mjs';
  return `${JSON.stringify(data, null, 2)}\n`;
});

console.log(`[v1431] CrewCheck ${VERSION}: plano gratuito confiável, 1 convidado e Premium com capacidade/automação ampliadas.`);
