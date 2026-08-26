-- CrewCheck Partner Gate API v1
-- MySQL 8 / Aiven
-- Safe to apply before enabling CREWCHECK_PARTNER_GATE_EXPORT_ENABLED.

CREATE TABLE IF NOT EXISTS crewcheck_partner_api_keys (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  partner_email VARCHAR(190) NULL,
  label VARCHAR(120) NOT NULL,
  key_prefix VARCHAR(24) NOT NULL,
  key_hash CHAR(64) NOT NULL,
  scopes VARCHAR(500) NOT NULL DEFAULT 'gates:read',
  active TINYINT(1) NOT NULL DEFAULT 1,
  last_used_at TIMESTAMP(3) NULL,
  created_by VARCHAR(190) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  revoked_at TIMESTAMP(3) NULL,
  UNIQUE KEY uq_crewcheck_partner_api_hash (key_hash),
  KEY idx_crewcheck_partner_api_prefix (key_prefix),
  KEY idx_crewcheck_partner_api_partner (partner_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_partner_api_rate_windows (
  api_key_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  window_started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  request_count INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_partner_webhooks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  api_key_id BIGINT UNSIGNED NOT NULL,
  url VARCHAR(1000) NOT NULL,
  url_hash CHAR(64) NOT NULL,
  description VARCHAR(160) NULL,
  events VARCHAR(500) NOT NULL DEFAULT 'flight.gate.updated',
  secret_prefix VARCHAR(24) NOT NULL,
  secret_ciphertext TEXT NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  failure_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_success_at TIMESTAMP(3) NULL,
  last_failure_at TIMESTAMP(3) NULL,
  disabled_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_partner_webhook_url (api_key_id,url_hash),
  KEY idx_partner_webhook_active (api_key_id,active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_partner_gate_watches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  api_key_id BIGINT UNSIGNED NOT NULL,
  flight VARCHAR(16) NOT NULL,
  origin CHAR(3) NOT NULL,
  destination CHAR(3) NOT NULL,
  starts_at TIMESTAMP(3) NOT NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  notify_initial TINYINT(1) NOT NULL DEFAULT 1,
  last_gate VARCHAR(32) NULL,
  last_terminal VARCHAR(32) NULL,
  last_observed_at TIMESTAMP(3) NULL,
  last_event_at TIMESTAMP(3) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_partner_gate_watch_due (active,starts_at,expires_at),
  KEY idx_partner_gate_watch_owner (api_key_id,active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_partner_webhook_events (
  event_id VARCHAR(80) PRIMARY KEY,
  api_key_id BIGINT UNSIGNED NOT NULL,
  watch_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(80) NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_partner_webhook_event_owner (api_key_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_partner_webhook_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_id VARCHAR(80) NOT NULL,
  webhook_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  response_status INT NULL,
  last_error VARCHAR(500) NULL,
  next_attempt_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  delivered_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_partner_webhook_delivery (event_id,webhook_id),
  KEY idx_partner_webhook_delivery_due (status,next_attempt_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
