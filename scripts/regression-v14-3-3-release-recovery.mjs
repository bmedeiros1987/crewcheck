import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const server = read('server.mjs');
const platform = read('server/platform.mjs');
const regulation = read('client/src/components/v1432/ManualRegulationView.tsx');
const securitySnippet = read('scripts/v1432/security-headers.snippet');
const regulationSnippet = read('scripts/v1432/server-regulation.snippet');
const v1424 = read('scripts/v1424/apply.mjs');
const v1432 = read('scripts/v1432/apply.mjs');
const packageJson = JSON.parse(read('package.json'));

let passed = 0;
function check(label, condition) {
  if (!condition) throw new Error(`[v14.3.3] Reprovado: ${label}`);
  passed += 1;
  console.log(`✓ ${label}`);
}

check('versão pública 14.3.3', packageJson.version === '14.3.3' && server.includes("version: '14.3.3'"));
check('v1424 aceita variantes da rota Telegram', v1424.includes('locationRoutePattern') && v1424.includes('originalRoute.replace'));
check('v1424 possui ponto seguro de instalação', v1424.includes('reliabilityAnchor') && v1424.includes('improvedThrottle'));
check('v1432 preserva intenções existentes', v1432.includes('complianceIntentPattern') && v1432.includes('complianceIntent, `${regulationIntent}\\n${complianceIntent}`'));
check('deduplicação Telegram', server.includes('crewcheckTelegramUpdateClaim(update)'));
check('edição de localização silenciosa', server.includes('crewcheckLocationReplySender') && server.includes('crewcheckSilentLocation'));
check('apresentação ausente não vira 08:00', regulation.includes("return minutes === null ? '' : simpleClock(minutes - 60)") && !regulation.includes('minutes === null ? DEFAULT_FORM.startTime'));
check('fim ausente permanece desconhecido', regulation.includes("return minutes === null ? '' : simpleClock(minutes + 30)") && !regulation.includes('minutes === null ? DEFAULT_FORM.plannedEndTime'));
check('mudança de horário reidrata o formulário', regulation.includes('JSON.stringify([scheduleDay?.date') && regulation.includes('leg.departureTime'));
check('Telegram não usa início sintético', !server.includes('conciergePresentationTime(record) || record.startTime') && !regulationSnippet.includes('conciergePresentationTime(record) || record.startTime'));
check('pergunta natural de limite regulatório', server.includes('que horas termina (?:minha )?jornada') && server.includes('limite (?:de )?regulamenta'));
check('alias exato configurado no Asaas', platform.includes("url.pathname === '/api/webhooks/asaas'"));
check('alias preserva autenticação do handler', platform.includes('await handleAsaasWebhook(req, res)') && platform.includes("req.headers['asaas-access-token']"));
check('Google Identity permitido na CSP', server.includes("script-src 'self' 'unsafe-inline' https://accounts.google.com") && securitySnippet.includes('https://accounts.google.com'));
check('pop-up Google preservado com COOP', server.includes("Cross-Origin-Opener-Policy', 'same-origin-allow-popups'"));
check('proteções HTTP restantes', server.includes("X-Frame-Options', 'DENY'") && server.includes("X-Content-Type-Options', 'nosniff'"));
check('script de regressão registrado', packageJson.scripts?.['regression:v14.3.3']?.includes('regression-v14-3-3-release-recovery.mjs'));

console.log(`CrewCheck v14.3.3: ${passed} verificações de recuperação aprovadas.`);
