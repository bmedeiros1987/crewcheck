import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const server = read('server.mjs');
const platform = read('server/platform.mjs');
const home = read('client/src/pages/Home.tsx');
const regulation = read('client/src/components/v1392/ManualRegulationView.tsx');
const regulationCss = read('client/src/components/v1392/v1392.css');
const emergency = read('server/v1391/emergency.mjs');
const manifest = read('client/public/manifest.json');
const androidGradle = read('android-wrapper/app/build.gradle');

assert.match(server, /telegramApiUrl\('sendVoice'\)/, 'Telegram deve usar sendVoice.');
assert.doesNotMatch(server, /telegramApiUrl\('sendAudio'\)/, 'O fluxo humano não deve usar sendAudio.');
assert.match(server, /form\.append\('voice'/, 'Upload deve usar o campo voice.');
assert.match(server, /'opus_48000_128'/, 'Voz nativa deve usar OGG Opus em alta qualidade por padrão.');
assert.match(server, /contentType: 'audio\/ogg'/, 'Telegram deve receber o MIME de nota de voz OGG.');
assert.match(server, /allowed_updates: \['message', 'edited_message', 'callback_query'\]/, 'Webhook deve receber callbacks.');
assert.match(server, /setMyCommands/, 'Menu de comandos deve ser sincronizado com o Telegram.');
assert.match(server, /buildCrewCheckAtis/, 'ATIS meteorológico deve existir.');
assert.match(server, /crewCheckAtisVoiceText/, 'ATIS falado deve omitir códigos brutos difíceis de entender.');
assert.doesNotMatch(server, /Informação \$\{informationLetter\}/, 'ATIS CrewCheck não deve inventar letra de informação oficial.');
assert.match(server, /decodeMetarPtBr/, 'METAR deve ter leitura acessível.');
assert.match(server, /AVIATION_WEATHER_USER_AGENT/, 'AviationWeather deve receber identificação do cliente.');
assert.match(server, /TELEGRAM_PUBLIC_BASE_URL/, 'URL pública do webhook deve aceitar a variável documentada.');
assert.match(server, /cc_call:confirm/, 'Ligação deve exigir confirmação explícita.');
assert.match(platform, /export async function refundPlatformUsage/, 'Falha do provedor deve permitir estorno de franquia.');
assert.match(emergency, /emerg\[êe\]ncia/, 'Botão visual de emergência deve alcançar a central.');
assert.match(home, /<ManualRegulationView compliance=\{compliance\}/, 'Rota de regulamentação deve abrir o simulador manual.');
assert.match(regulation, /Tabela B\.1/, 'Simulador deve informar a tabela aplicada.');
assert.match(regulation, /não é autorização automática/i, 'Extensão deve preservar aviso operacional.');
assert.match(regulationCss, /@media \(min-width:1024px\)/, 'A melhoria do menu deve ser exclusiva do desktop.');
assert.match(regulationCss, /1180px/, 'Menu desktop deve aproveitar uma área maior.');
assert.match(manifest, /"version": "13\.9\.2"/, 'Manifesto PWA deve publicar a versão atual.');
assert.match(androidGradle, /versionCode 139200/, 'Android deve avançar o versionCode para a Play Console.');
assert.match(androidGradle, /versionName '13\.9\.2'/, 'Android deve gerar o AAB v13.9.2.');

console.log('CrewCheck v13.9.2 regression: Telegram voice, ATIS, emergency, regulation and desktop menu OK.');
