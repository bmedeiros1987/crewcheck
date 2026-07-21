import fs from 'node:fs';

const server = fs.readFileSync('server.mjs', 'utf8');
const helpers = fs.readFileSync('server/v1403/premium-helpers.snippet', 'utf8');
const human = fs.readFileSync('server/v1403/telegram-human.mjs', 'utf8');

function check(condition, message) {
  if (!condition) throw new Error(message);
}

check(server.includes('conciergeOnboardingIsOperationalCommand'), 'Onboarding guard not applied to server.');
check(server.includes('conciergeOnboardingExpired'), 'Onboarding expiration not applied.');
check(server.includes('A configuração de nomes expirou'), 'Expiration response missing.');
check(server.includes('Todas as etapas previstas foram concluídas'), 'Post-duty rest response missing.');
check(server.includes('conciergeRestAfterLastProgram'), 'Rest resolver missing.');
check(server.includes("/^\\/(?:cancelar|sair)"), 'Explicit cancel command missing.');
check(helpers.includes('conciergeIdentityFlow'), 'Premium helpers source missing.');
check(human.includes('/cancelar'), 'Concierge settings guidance missing cancel command.');
console.log('CrewCheck v14.2.0 — Telegram onboarding guard and post-duty rest: OK');
