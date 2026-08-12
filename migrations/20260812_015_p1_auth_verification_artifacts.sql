-- CrewCheck P-1 Auth — verification primitives only.
-- Safe preparatory migration: no runtime behavior is enabled by this file alone.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS crewcheck_platform_email_identity_state (
  email VARCHAR(254) NOT NULL,
  verification_state ENUM('pending_email_verification','verified') NOT NULL DEFAULT 'pending_email_verification',
  verified_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (email),
  KEY crewcheck_email_state_idx (verification_state, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_auth_artifacts (
  id VARCHAR(64) NOT NULL,
  email VARCHAR(254) NOT NULL,
  purpose ENUM('email_verification','password_reset') NOT NULL,
  token_hash CHAR(64) NOT NULL,
  code_hash CHAR(64) NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  invalidated_at DATETIME(3) NULL,
  attempts INT NOT NULL DEFAULT 0,
  correlation_id VARCHAR(64) NOT NULL,
  delivery_state ENUM('created','accepted','sent','delivered','rejected','failed') NOT NULL DEFAULT 'created',
  delivery_provider VARCHAR(40) NULL,
  delivery_message_id VARCHAR(160) NULL,
  requested_ip_hash CHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY crewcheck_auth_artifact_correlation_uq (correlation_id),
  KEY crewcheck_auth_artifact_lookup_idx (email, purpose, created_at),
  KEY crewcheck_auth_artifact_active_idx (email, purpose, used_at, invalidated_at, expires_at),
  KEY crewcheck_auth_artifact_delivery_idx (delivery_state, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO crewcheck_schema_migrations(version, description)
VALUES ('20260812_015', 'P-1 Auth single-use verification/reset artifact primitives');
