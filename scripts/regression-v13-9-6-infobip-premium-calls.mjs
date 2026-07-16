import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildInfobipTtsRequest,
  infobipConfiguration,
  infobipPublicStatus,
  normalizeInfobipBaseUrl,
} from '../server/v1396/infobip.mjs';

const currentEnvironment = {
  INFOBIP_API_KEY: 'App test-key-not-a-secret',
  INFOBIP_BASE_URL: 'crewcheck.api.infobip.com/',
  INFOBIP_PHONE_FROM: '+55 (61) 3333-4444',
  INFOBIP_VOICE_LANGUAGE: 'pt-BR',
};

assert.equal(normalizeInfobipBaseUrl('crewcheck.api.infobip.com/'), 'https://crewcheck.api.infobip.com');
assert.equal(normalizeInfobipBaseUrl('http://crewcheck.api.infobip.com'), '');

const configuration = infobipConfiguration(currentEnvironment);
assert.equal(configuration.configured, true);
assert.equal(configuration.apiKey, 'test-key-not-a-secret');
assert.equal(configuration.from, '556133334444');
assert.equal(configuration.sources.from, 'INFOBIP_PHONE_FROM');

const request = buildInfobipTtsRequest({
  environment: currentEnvironment,
  phone: '+55 (61) 99999-0000',
  text: 'Teste CrewCheck',
});
assert.equal(request.ok, true);
assert.equal(request.url, 'https://crewcheck.api.infobip.com/tts/3/advanced');
assert.equal(request.headers.authorization, 'App test-key-not-a-secret');
assert.deepEqual(request.body.messages[0].destinations, [{ to: '5561999990000' }]);
assert.equal(request.body.messages[0].from, '556133334444');
assert.equal(request.body.messages[0].language, 'pt-BR');

const legacyAlias = infobipConfiguration({
  INFOBIP_API_KEY: 'legacy-key',
  INFOBIP_BASE_URL: 'https://legacy.api.infobip.com',
  INFOBIP_FROM: '556133334444',
});
assert.equal(legacyAlias.configured, true);
assert.equal(legacyAlias.sources.from, 'INFOBIP_FROM');

const incomplete = infobipPublicStatus({ INFOBIP_API_KEY: 'private-value' });
assert.equal(incomplete.configured, false);
assert.deepEqual(incomplete.missing, ['INFOBIP_BASE_URL', 'INFOBIP_PHONE_FROM (ou INFOBIP_FROM)']);
assert.doesNotMatch(JSON.stringify(incomplete), /private-value/);

const server = fs.readFileSync('server.mjs', 'utf8');
const render = fs.readFileSync('render.yaml', 'utf8');
const example = fs.readFileSync('.env.example', 'utf8');
const safeguards = fs.readFileSync('scripts/v1396/apply.mjs', 'utf8');
assert.match(server, /buildInfobipTtsRequest/);
assert.match(server, /phoneCallMessage/);
assert.match(server, /conectado para ligações Premium/);
assert.match(server, /update\?\.callback_query && await handleV139Telegram\(update, sendTelegramMessage\)/);
assert.match(server, /chatId && await handleV139Telegram\(update, sendTelegramMessage\)/);
assert.doesNotMatch(server, /message\?\.document && await handleV139Telegram\(message/);
assert.match(render, /CREWCHECK_WAKEUP_CALL_PROVIDER\s*\n\s*value: infobip/);
assert.match(render, /key: INFOBIP_PHONE_FROM/);
assert.match(example, /CREWCHECK_WAKEUP_CALL_PROVIDER=infobip/);
assert.match(safeguards, /versionCode\\s\+\\d\+\\b/);
assert.match(safeguards, /manifest\.version = VERSION/);

console.log('CrewCheck v13.9.6 Infobip Premium call integration regression OK.');
