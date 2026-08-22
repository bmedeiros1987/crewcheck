import assert from 'node:assert/strict';
import {
  buildCallMeBotPhoneRequest,
  callMeBotPhoneConfiguration,
  selectWakeupPhoneProvider,
} from '../server/wakeup-call-provider.mjs';

const callMeBotEnvironment = {
  CREWCHECK_WAKEUP_CALL_PROVIDER: 'infobip',
  CALLMEBOT_API_KEY: 'test-callmebot-key',
  CALLMEBOT_PHONE: '+55 (61) 99999-0000',
};

assert.equal(callMeBotPhoneConfiguration(callMeBotEnvironment).configured, true);
assert.equal(selectWakeupPhoneProvider(callMeBotEnvironment), 'callmebot', 'CallMeBot must rescue an incomplete Infobip migration');

const request = buildCallMeBotPhoneRequest({
  environment: callMeBotEnvironment,
  text: '<b>Despertador</b> CrewCheck',
});
assert.equal(request.ok, true);
const url = new URL(request.url);
assert.equal(url.origin + url.pathname, 'https://api.callmebot.com/call.php');
assert.equal(url.searchParams.get('phone'), '+5561999990000');
assert.equal(url.searchParams.get('text'), 'Despertador CrewCheck');
assert.equal(url.searchParams.get('apikey'), 'test-callmebot-key');

const infobipEnvironment = {
  CREWCHECK_WAKEUP_CALL_PROVIDER: 'infobip',
  INFOBIP_API_KEY: 'test-infobip-key',
  INFOBIP_BASE_URL: 'https://crewcheck.api.infobip.com',
  INFOBIP_PHONE_FROM: '+556133334444',
};
assert.equal(selectWakeupPhoneProvider(infobipEnvironment), 'infobip');
assert.equal(selectWakeupPhoneProvider({ CREWCHECK_WAKEUP_CALL_PROVIDER: 'callmebot' }), 'none');

console.log('CrewCheck wake-up VoIP provider restore regression OK.');
