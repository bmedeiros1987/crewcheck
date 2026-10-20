-- Manual operational migration, MySQL 8.x. Not run by startup or deploy.
-- No backfill, roster FK, cascade, production data changes or activation here.
CREATE TABLE IF NOT EXISTS crewcheck_financial_heads (
  owner_id VARCHAR(254) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  entry_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  latest_revision INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_id, entry_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS crewcheck_financial_revisions (
  owner_id VARCHAR(254) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  entry_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  revision INT UNSIGNED NOT NULL,
  idempotency_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  snapshot JSON NOT NULL,
  receipt JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (owner_id, entry_id, revision),
  UNIQUE KEY financial_owner_idempotency (owner_id, idempotency_key),
  CONSTRAINT financial_revision_positive CHECK (revision > 0),
  CONSTRAINT financial_snapshot_json CHECK (JSON_TYPE(snapshot) = 'OBJECT'),
  CONSTRAINT financial_receipt_json CHECK (JSON_TYPE(receipt) = 'OBJECT')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
