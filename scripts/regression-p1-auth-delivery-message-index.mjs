import assert from 'node:assert/strict';
import fs from 'node:fs';

const oldMigration = fs.readFileSync('migrations/20260812_015_p1_auth_verification_artifacts.sql', 'utf8');
const migration = fs.readFileSync('migrations/20260814_016_p1_auth_delivery_message_index.sql', 'utf8');

assert.match(oldMigration, /delivery_message_id\s+VARCHAR\(160\)\s+NULL/i, 'migration 015 must keep the delivery_message_id column');
assert.doesNotMatch(oldMigration, /crewcheck_auth_artifact_message_idx/i, 'migration 015 must remain immutable; add the index only in a forward migration');
assert.match(migration, /ALTER TABLE\s+crewcheck_platform_auth_artifacts/i, 'forward migration must alter the auth artifact table');
assert.match(migration, /ADD KEY\s+crewcheck_auth_artifact_message_idx\s*\(delivery_message_id\)/i, 'delivery_message_id must have a dedicated lookup index');
assert.doesNotMatch(migration, /UNIQUE\s+(?:KEY|INDEX)[\s\S]*delivery_message_id/i, 'provider message id must not be made unique before runtime uniqueness is proven');
assert.match(migration, /20260814_016/, 'migration must register its schema version');

console.log('P-1 Auth delivery message index regression: ok');
