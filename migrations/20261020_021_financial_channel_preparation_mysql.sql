-- PREPARATION ONLY. Manual, separately authorized MySQL 8 migration.
-- No startup/deploy hook, backfill, activation, credentials or grants.
CREATE TABLE IF NOT EXISTS crewcheck_financial_channel_consents (
  owner_id VARCHAR(254) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  conversation_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  revision INT UNSIGNED NOT NULL,
  consent JSON NOT NULL,
  PRIMARY KEY (owner_id, conversation_id),
  CONSTRAINT financial_channel_revision_positive CHECK (revision > 0),
  CONSTRAINT financial_channel_consent_object CHECK (JSON_TYPE(consent) = 'OBJECT')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS crewcheck_financial_source_observations (
  owner_id VARCHAR(254) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  entry_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  revision INT UNSIGNED NOT NULL,
  source_fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_as_of_ms BIGINT UNSIGNED NOT NULL,
  recorded_at_ms BIGINT UNSIGNED NOT NULL,
  evidence_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (owner_id, entry_id, revision),
  CONSTRAINT financial_source_revision_positive CHECK (revision > 0),
  CONSTRAINT financial_source_ordered CHECK (source_as_of_ms <= recorded_at_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
