-- CrewCheck P0 #399 — append-only audit log for legacy roster recovery.
-- Adds ONLY this new table. Never touches crewcheck_users, crewcheck_rosters, or
-- any crewcheck_platform_* table. Application code only ever INSERTs into this
-- table (enforced by code review + regression, not by the schema itself) -
-- legacy_roster_id is unique so the same legacy roster can never be recovered
-- twice, which is the primary idempotency guard for the recovery write path.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS crewcheck_platform_roster_recovery_log (
  id VARCHAR(64) NOT NULL,
  legacy_roster_id CHAR(36) NOT NULL,
  owner_email VARCHAR(254) NOT NULL,
  roster_key VARCHAR(20) NOT NULL,
  current_roster_id VARCHAR(64) NULL,
  status VARCHAR(32) NOT NULL,
  reason VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY crewcheck_roster_recovery_legacy_uq (legacy_roster_id),
  KEY crewcheck_roster_recovery_owner_idx (owner_email, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO crewcheck_schema_migrations(version, description)
VALUES ('20260816_018', 'P0 #399 legacy roster recovery append-only log');
