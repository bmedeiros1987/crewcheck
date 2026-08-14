import assert from 'node:assert/strict';
import fs from 'node:fs';
import { authDeliveryStateForMailerSendEvent } from '../server/v1412/mailersendWebhook.mjs';

assert.equal(authDeliveryStateForMailerSendEvent('sent'), 'sent');
assert.equal(authDeliveryStateForMailerSendEvent('delivered'), 'delivered');
assert.equal(authDeliveryStateForMailerSendEvent('hard_bounced'), 'rejected');
assert.equal(authDeliveryStateForMailerSendEvent('rejected'), 'rejected');
assert.equal(authDeliveryStateForMailerSendEvent('soft_bounced'), 'failed');
assert.equal(authDeliveryStateForMailerSendEvent('failed'), 'failed');
assert.equal(authDeliveryStateForMailerSendEvent('activity.sent'), 'sent');
assert.equal(authDeliveryStateForMailerSendEvent('activity.delivered'), 'delivered');
assert.equal(authDeliveryStateForMailerSendEvent('activity.hard_bounced'), 'rejected');
assert.equal(authDeliveryStateForMailerSendEvent('activity.soft_bounced'), 'failed');
assert.equal(authDeliveryStateForMailerSendEvent('activity.spam_complaint'), null);
assert.equal(authDeliveryStateForMailerSendEvent('spam_complaint'), null);
assert.equal(authDeliveryStateForMailerSendEvent('unsubscribed'), null);
assert.equal(authDeliveryStateForMailerSendEvent('unknown'), null);

const source = fs.readFileSync(new URL('../server/v1412/mailersendWebhook.mjs', import.meta.url), 'utf8');
assert.match(source, /rawType\.startsWith\('activity\.'\)/, 'MailerSend activity.* event prefix must be normalized before the allowlist');
assert.match(source, /data\?\.email\?\.message\?\.id/, 'real MailerSend nested provider message id must be accepted');
assert.match(source, /safeString\(messageId, 160\)/, 'provider message id must stay bounded to the auth artifact column');
assert.match(source, /WHERE delivery_message_id=\?/, 'webhook lifecycle must correlate only by provider message id');
assert.match(source, /WHEN delivery_state='delivered' THEN delivery_state/, 'delivered must never be downgraded');
assert.match(source, /WHEN delivery_state='rejected' THEN delivery_state/, 'hard rejection must never be downgraded');
assert.match(source, /WHEN \?='sent' AND delivery_state IN \('created','accepted'\) THEN 'sent'/, 'sent may advance only pre-sent states');
assert.match(source, /authArtifactMatched: authDelivery\.matched/, 'logs may expose only a boolean match, never the provider message id');
assert.doesNotMatch(source, /console\.(?:info|log)[\s\S]{0,300}messageId/, 'provider message id must not be logged');

console.log('P-1 Auth webhook delivery reconciliation regression passed.');
