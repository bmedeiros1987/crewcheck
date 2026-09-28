-- CrewCheck v13.9.5 - Medical profile and coordinated emergency care
-- Aiven MySQL 8.x. Idempotente e sem credenciais.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS crewcheck_platform_emergency_profiles (
  owner_email VARCHAR(254) NOT NULL,
  cipher_text LONGTEXT NOT NULL,
  cipher_iv VARCHAR(128) NOT NULL,
  cipher_tag VARCHAR(128) NOT NULL,
  consent_medical_share TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (owner_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_emergency_preferences (
  owner_email VARCHAR(254) NOT NULL,
  notify_saved_contacts TINYINT(1) NOT NULL DEFAULT 1,
  notify_hotel_companions TINYINT(1) NOT NULL DEFAULT 1,
  include_location TINYINT(1) NOT NULL DEFAULT 1,
  include_medical_profile TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (owner_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_emergency_sessions (
  owner_email VARCHAR(254) NOT NULL,
  pending_kind VARCHAR(40) NULL,
  pending_action VARCHAR(40) NULL,
  latitude DOUBLE NULL,
  longitude DOUBLE NULL,
  location_label VARCHAR(500) NULL,
  location_source VARCHAR(40) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (owner_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_emergency_responses (
  alert_id VARCHAR(64) NOT NULL,
  responder_chat_hash CHAR(64) NOT NULL,
  responder_name VARCHAR(160) NOT NULL,
  responder_username VARCHAR(160) NULL,
  response_status VARCHAR(30) NOT NULL DEFAULT 'helping',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (alert_id,responder_chat_hash),
  KEY crewcheck_emergency_response_alert_idx (alert_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO crewcheck_schema_migrations(version, description)
VALUES ('20260716_007', 'Medical profile repair, coordinated Telegram emergencies and open care search');
