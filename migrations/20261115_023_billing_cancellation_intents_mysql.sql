-- Isolated additive proposal. No runtime installer or production application.
-- Hashes are pseudonymous evidence, not anonymity or an approved retention policy.
CREATE TABLE IF NOT EXISTS crewcheck_billing_cancellation_intents (
 operation_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 account_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 owner_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 contract_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 state VARCHAR(24) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 PRIMARY KEY(operation_id),
 UNIQUE KEY cancellation_contract_uq(contract_hash),
 CONSTRAINT cancellation_state_ck CHECK(state IN ('reserved','dispatching','uncertain','acknowledged','applied','reconciliation_required'))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS crewcheck_billing_cancellation_evidence (
 receipt_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 operation_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 kind VARCHAR(20) NOT NULL,
 source VARCHAR(24) NOT NULL,
 evidence_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(receipt_id),
 KEY cancellation_evidence_operation_idx(operation_id),
 CONSTRAINT cancellation_evidence_fk FOREIGN KEY(operation_id) REFERENCES crewcheck_billing_cancellation_intents(operation_id),
 CONSTRAINT cancellation_evidence_kind_ck CHECK(kind IN ('acknowledged','uncertain')),
 CONSTRAINT cancellation_evidence_source_ck CHECK(source IN ('http_ack','provider_probe','transport_uncertain'))
) ENGINE=InnoDB;
