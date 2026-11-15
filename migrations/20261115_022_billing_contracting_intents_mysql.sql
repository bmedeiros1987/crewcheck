-- Additive proposal only: no runtime installer. Apply only after schema/release review.
-- No entitlement or subscription is created by this migration.
CREATE TABLE IF NOT EXISTS crewcheck_billing_contracting_intents (
  operation_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  owner_email VARCHAR(254) NOT NULL,
  owner_public_id VARCHAR(24) NOT NULL,
  provider VARCHAR(20) NOT NULL,
  plan VARCHAR(40) NOT NULL,
  state VARCHAR(24) NOT NULL,
  active_slot TINYINT NOT NULL DEFAULT 1,
  provider_ref VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (operation_id),
  UNIQUE KEY billing_intent_open_owner_uq (owner_email, active_slot),
  UNIQUE KEY billing_intent_provider_ref_uq (provider, provider_ref),
  CONSTRAINT billing_intent_state_ck CHECK (state IN ('reserved','dispatching','uncertain','created')),
  CONSTRAINT billing_intent_slot_ck CHECK (active_slot = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_billing_intent_evidence (
  receipt_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  operation_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  kind VARCHAR(24) NOT NULL,
  provider_ref VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL,
  evidence_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (receipt_id),
  KEY billing_intent_evidence_operation_idx (operation_id),
  CONSTRAINT billing_intent_evidence_operation_fk FOREIGN KEY (operation_id)
    REFERENCES crewcheck_billing_contracting_intents(operation_id),
  CONSTRAINT billing_intent_evidence_kind_ck CHECK (kind IN ('created','uncertain'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
