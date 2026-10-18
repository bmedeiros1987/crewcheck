-- Additive, operator-applied migration. No runtime DDL, provider calls or access grants.
CREATE TABLE IF NOT EXISTS crewcheck_asaas_webhook_inbox (
  event_id VARCHAR(180) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  event_name VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  subscription_ref VARCHAR(180) CHARACTER SET ascii COLLATE ascii_bin NULL,
  payment_ref VARCHAR(180) CHARACTER SET ascii COLLATE ascii_bin NULL,
  event_time VARCHAR(19) CHARACTER SET ascii COLLATE ascii_bin NULL,
  funded_period_end DATETIME(3) NULL,
  decision_payload JSON NOT NULL,
  disposition VARCHAR(24) NOT NULL,
  reason VARCHAR(64) NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (event_id),
  KEY crewcheck_asaas_pending_idx (disposition, subscription_ref, event_time),
  KEY crewcheck_asaas_payment_idx (subscription_ref, payment_ref, event_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Receive and explicit retry acquire this lock before any receipt/subscription lock.
CREATE TABLE IF NOT EXISTS crewcheck_asaas_subscription_locks (
  subscription_ref VARCHAR(180) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (subscription_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
