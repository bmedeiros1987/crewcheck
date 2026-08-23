import assert from 'node:assert/strict';
import { buildInfobipTtsRequest, infobipProviderErrorDetail } from '../../server/v1396/infobip.mjs';

const detail = infobipProviderErrorDetail(JSON.stringify({
  requestError: {
    serviceException: {
      messageId: 'INVALID_DESTINATION',
      text: 'Destination +5561996071663 is not allowed',
      validationErrors: { to: 'Use +5561996071663' },
    },
  },
}));
assert.match(detail, /INVALID_DESTINATION/);
assert.match(detail, /\[número\]/);
assert.doesNotMatch(detail, /5561996071663/);
assert.equal(infobipProviderErrorDetail(''), '');
const request = buildInfobipTtsRequest({
  environment: {
    INFOBIP_API_KEY: 'test-key',
    INFOBIP_BASE_URL: 'https://example.api.infobip.com',
    INFOBIP_PHONE_FROM: '+16728742360',
    INFOBIP_VOICE_LANGUAGE: 'pt-BR',
  },
  phone: '+5561996071663',
  text: 'Teste CrewCheck',
});
assert.equal(request.body.messages[0].language, 'pt');
console.log('[v14404] regressao ok');
