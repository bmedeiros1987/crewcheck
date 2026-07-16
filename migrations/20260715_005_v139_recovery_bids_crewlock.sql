-- CrewCheck v13.9.0 — Aiven MySQL 8.x
-- Recuperação segura, BIDS e CrewLock. Idempotente, sem credenciais.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS crewcheck_platform_accounts (
  email VARCHAR(254) NOT NULL,
  password_hash CHAR(128) NOT NULL,
  password_salt VARCHAR(64) NOT NULL,
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_password_resets (
  id VARCHAR(64) NOT NULL,
  email VARCHAR(254) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  attempts INT NOT NULL DEFAULT 0,
  channels JSON NULL,
  requested_ip_hash CHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY crewcheck_reset_email_idx (email, created_at),
  KEY crewcheck_reset_expiry_idx (expires_at, used_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_bid_windows (
  id VARCHAR(64) NOT NULL,
  owner_email VARCHAR(254) NOT NULL,
  title VARCHAR(180) NOT NULL,
  target_month CHAR(7) NOT NULL,
  opens_at DATETIME(3) NOT NULL,
  closes_at DATETIME(3) NOT NULL,
  provider_url VARCHAR(800) NULL,
  notify_open TINYINT(1) NOT NULL DEFAULT 1,
  notify_last_day TINYINT(1) NOT NULL DEFAULT 1,
  open_notified_at DATETIME(3) NULL,
  last_day_notified_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY crewcheck_bid_owner_idx (owner_email, opens_at, closes_at),
  KEY crewcheck_bid_due_idx (opens_at, closes_at, open_notified_at, last_day_notified_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_documents (
  id VARCHAR(64) NOT NULL,
  owner_email VARCHAR(254) NOT NULL,
  category VARCHAR(60) NOT NULL,
  encrypted_name TEXT NOT NULL,
  mime_type VARCHAR(160) NOT NULL,
  storage_provider VARCHAR(40) NOT NULL DEFAULT 'cloudinary',
  storage_public_id VARCHAR(500) NOT NULL,
  storage_cipher_url TEXT NOT NULL,
  cipher_algorithm VARCHAR(40) NOT NULL DEFAULT 'AES-256-GCM',
  cipher_iv VARCHAR(128) NOT NULL,
  cipher_tag VARCHAR(128) NOT NULL,
  plaintext_sha256 CHAR(64) NOT NULL,
  bytes BIGINT NOT NULL,
  source VARCHAR(40) NOT NULL DEFAULT 'app',
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY crewcheck_documents_owner_idx (owner_email, status, created_at),
  KEY crewcheck_documents_hash_idx (owner_email, plaintext_sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_document_access (
  id VARCHAR(64) NOT NULL,
  document_id VARCHAR(64) NOT NULL,
  owner_email VARCHAR(254) NOT NULL,
  action VARCHAR(40) NOT NULL,
  device_hash CHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY crewcheck_document_access_idx (owner_email, document_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_document_deletion_queue (
  id VARCHAR(64) NOT NULL,
  document_id VARCHAR(64) NOT NULL,
  owner_email VARCHAR(254) NOT NULL,
  storage_public_id VARCHAR(500) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  last_error VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  completed_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY crewcheck_document_delete_queue_idx (completed_at, attempts, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO crewcheck_schema_migrations(version, description)
VALUES ('20260715_005', 'Recovery, BIDS, CrewLock and routine endpoints');
