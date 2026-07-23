-- CrewCheck 14.3.16 — Guardian, suporte e observabilidade agregada.
-- Idempotente, sem credenciais e sem dados pessoais de exemplo.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS crewcheck_guardian_cards (
  id VARCHAR(64) NOT NULL,
  owner_email VARCHAR(254) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  payload_cipher MEDIUMTEXT NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_opened_at DATETIME(3) NULL,
  open_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY crewcheck_guardian_token_uq (token_hash),
  KEY crewcheck_guardian_owner_idx (owner_email, expires_at, revoked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_support_tickets (
  id VARCHAR(64) NOT NULL,
  requester_email VARCHAR(254) NOT NULL,
  category VARCHAR(40) NOT NULL,
  priority VARCHAR(20) NOT NULL,
  subject VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  expected_result TEXT NULL,
  actual_result TEXT NULL,
  reproduction_steps TEXT NULL,
  diagnostics JSON NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY crewcheck_support_status_idx (status, created_at),
  KEY crewcheck_support_requester_idx (requester_email, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_aggregate_metrics (
  day_key DATE NOT NULL,
  event_kind VARCHAR(60) NOT NULL,
  event_count BIGINT NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (day_key, event_kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_telegram_locations (
  chat_id VARCHAR(120) NOT NULL,
  latitude DOUBLE NOT NULL,
  longitude DOUBLE NOT NULL,
  accuracy DOUBLE NULL,
  source VARCHAR(30) NOT NULL DEFAULT 'static',
  live_until DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (chat_id),
  KEY crewcheck_telegram_locations_fresh_idx (updated_at, live_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO crewcheck_schema_migrations (version, description)
VALUES ('20260723_014', 'CrewCheck 14.3.16 Guardian, suporte, localização Telegram e métricas agregadas')
ON DUPLICATE KEY UPDATE description=VALUES(description);
