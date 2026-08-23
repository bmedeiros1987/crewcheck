import assert from 'node:assert/strict';
import { infobipProviderErrorDetail } from '../../server/v1396/infobip.mjs';

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
console.log('[v14404] regressao ok');
