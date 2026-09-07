-- CrewCheck Partner Roster Exchange v1
-- MySQL 8 / Aiven
-- Safe to apply while CREWCHECK_PARTNER_ROSTER_IMPORT_ENABLED=false.

CREATE TABLE IF NOT EXISTS crewcheck_partner_roster_links (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  owner_email VARCHAR(254) NOT NULL,
  token_prefix VARCHAR(24) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  bound_api_key_id BIGINT UNSIGNED NULL,
  label VARCHAR(120) NULL,
  expected_crew_id VARCHAR(40) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  expires_at TIMESTAMP(3) NOT NULL,
  last_used_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  revoked_at TIMESTAMP(3) NULL,
  UNIQUE KEY uq_partner_roster_link_hash (token_hash),
  KEY idx_partner_roster_link_owner (owner_email,active,expires_at),
  KEY idx_partner_roster_link_partner (bound_api_key_id,active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_partner_roster_imports (
  id CHAR(36) NOT NULL PRIMARY KEY,
  api_key_id BIGINT UNSIGNED NOT NULL,
  link_id BIGINT UNSIGNED NOT NULL,
  owner_email VARCHAR(254) NOT NULL,
  external_id VARCHAR(160) NOT NULL,
  source_name VARCHAR(120) NOT NULL,
  authorization_reference VARCHAR(180) NOT NULL,
  filename VARCHAR(180) NOT NULL,
  mime_type VARCHAR(80) NOT NULL DEFAULT 'application/pdf',
  file_sha256 CHAR(64) NOT NULL,
  file_size_bytes INT UNSIGNED NOT NULL,
  raw_ciphertext LONGTEXT NOT NULL,
  source_document_created_at TIMESTAMP(3) NULL,
  parse_status VARCHAR(32) NOT NULL DEFAULT 'received',
  parser_version VARCHAR(120) NULL,
  summary_json LONGTEXT NULL,
  parse_error VARCHAR(500) NULL,
  received_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  parsed_at TIMESTAMP(3) NULL,
  UNIQUE KEY uq_partner_roster_external (api_key_id,external_id),
  UNIQUE KEY uq_partner_roster_owner_file (owner_email,file_sha256),
  KEY idx_partner_roster_owner_received (owner_email,received_at),
  KEY idx_partner_roster_link_received (link_id,received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_partner_roster_parse_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  import_id CHAR(36) NOT NULL,
  parser_version VARCHAR(120) NOT NULL,
  parse_status VARCHAR(32) NOT NULL,
  parsed_ciphertext LONGTEXT NULL,
  diagnostics_json LONGTEXT NULL,
  summary_json LONGTEXT NULL,
  parse_error VARCHAR(500) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_partner_roster_parse_import (import_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
