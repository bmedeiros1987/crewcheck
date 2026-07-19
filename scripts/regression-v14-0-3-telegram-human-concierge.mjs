import assert from 'node:assert/strict';
import fs from 'node:fs';

await import('./v139/apply.mjs');

const server = fs.readFileSync('server.mjs', 'utf8');
const human = fs.readFileSync('server/v1403/telegram-human.mjs', 'utf8');
const metadata = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const android = fs.readFileSync('android-wrapper/app/build.gradle', 'utf8');

assert.equal(metadata.version, '14.0.3');
assert.match(android, /versionCode 140003\b/);
assert.match(android, /versionName '14\.0\.3'/);

assert.match(server, /server\/v1403\/telegram-human\.mjs/);
assert.match(server, /conciergeFunctionKeyboard/);
assert.match(server, /conciergeSettingsKeyboard/);
assert.match(server, /⬅️ Voltar ao menu/);
assert.match(server, /handleTelegramNavigationCallback/);
assert.match(server, /cc_nav:menu/);
assert.match(server, /command: 'configuracoes'/);

assert.match(server, /conciergeIdentityFlow/);
assert.match(server, /onboardingStep: 'ask-user-name'/);
assert.match(server, /DEFAULT_CONCIERGE_NAME/);
assert.match(server, /textOnlyIdentitySettings: true/);
assert.match(server, /premiumAccess: user\.premiumAccess/);

assert.match(server, /conciergePremiumScheduleReply/);
assert.match(server, /conciergePremiumDepartureReply/);
assert.match(server, /runRadarRace\(buildFlightContext\(firstLeg\.flightNumber\)/);
assert.match(server, /flightLegInterpretation: true/);
assert.match(server, /spokenTimeInterpretation: true/);
assert.match(server, /naturalPortugueseVoice: true/);
assert.match(server, /premiumVoicePolicy\(/);
assert.match(server, /premiumVoiceText\(/);
assert.doesNotMatch(server, /\[`Ouvi: “\$\{transcript\.slice/);

assert.match(human, /DEFAULT_CONCIERGE_NAME = 'Bruno Saraiva'/);
assert.match(human, /Fala, \$\{role \? `\$\{role\} ` : ''\}\$\{name\}\./);
assert.match(human, /você tem \$\{count\} perna/);
assert.match(human, /A apresentação é às/);
assert.match(human, /a chave termina em/);
assert.match(human, /O trânsito está/);
assert.match(human, /LATAM/);
assert.match(human, /Gol/);
assert.match(human, /Azul/);
assert.match(human, /seu dia está em branco na escala/);
assert.match(human, /sua folga termina às/);
assert.match(human, /settings-text-only/);
assert.match(human, /location-or-directory-text-only/);

console.log('CrewCheck v14.0.3 natural Telegram concierge regression OK.');
