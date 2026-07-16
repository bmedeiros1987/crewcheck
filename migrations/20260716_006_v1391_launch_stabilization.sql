-- CrewCheck v13.9.1 - Launch Stabilization
-- Aiven MySQL 8.x. Idempotente e sem credenciais.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS crewcheck_platform_crewlock_blobs (
  document_id VARCHAR(64) NOT NULL,
  owner_email VARCHAR(254) NOT NULL,
  cipher LONGBLOB NOT NULL,
  bytes BIGINT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (document_id),
  KEY crewcheck_crewlock_blob_owner_idx (owner_email, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE IF NOT EXISTS crewcheck_platform_emergency_alerts (
  id VARCHAR(64) NOT NULL,
  owner_email VARCHAR(254) NOT NULL,
  emergency_kind VARCHAR(40) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  message TEXT NOT NULL,
  location_url TEXT NULL,
  recipients JSON NOT NULL,
  channels JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  cancelled_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY crewcheck_emergency_alert_owner_idx (owner_email, created_at),
  KEY crewcheck_emergency_alert_status_idx (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO crewcheck_schema_migrations(version, description)
VALUES ('20260716_006', 'CrewLock fallback, emergency center, PBS and launch stabilization');
