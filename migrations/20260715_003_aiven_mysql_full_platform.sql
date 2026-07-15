-- CrewCheck 13.8.7
-- Banco oficial e exclusivo: Aiven MySQL 8.x.
-- Idempotente para instalacao limpa; nao contem credenciais.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS crewcheck_schema_migrations (
  version VARCHAR(40) NOT NULL,
  description VARCHAR(255) NOT NULL,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_profiles (
  email VARCHAR(254) NOT NULL,
  public_id VARCHAR(24) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  locale VARCHAR(20) NOT NULL DEFAULT 'pt-BR',
  timezone VARCHAR(80) NOT NULL DEFAULT 'America/Sao_Paulo',
  plan VARCHAR(40) NOT NULL DEFAULT 'free',
  share_presence TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (email),
  UNIQUE KEY crewcheck_profiles_public_id_uq (public_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_subscriptions (
  email VARCHAR(254) NOT NULL,
  plan VARCHAR(40) NOT NULL,
  status VARCHAR(40) NOT NULL,
  provider VARCHAR(40) NOT NULL,
  product_id VARCHAR(120) NULL,
  provider_ref VARCHAR(255) NULL,
  purchase_token_hash CHAR(64) NULL,
  current_period_end DATETIME(3) NULL,
  cancel_at_period_end TINYINT(1) NOT NULL DEFAULT 0,
  metadata JSON NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (email),
  UNIQUE KEY crewcheck_purchase_token_uq (purchase_token_hash),
  KEY crewcheck_subscription_provider_idx (provider, provider_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_usage (
  email VARCHAR(254) NOT NULL,
  month_key CHAR(7) NOT NULL,
  usage_kind VARCHAR(60) NOT NULL,
  used INT NOT NULL DEFAULT 0,
  limit_value INT NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (email, month_key, usage_kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_rosters (
  id VARCHAR(64) NOT NULL,
  owner_email VARCHAR(254) NOT NULL,
  roster_key VARCHAR(20) NOT NULL,
  roster JSON NOT NULL,
  compliance JSON NOT NULL,
  gym JSON NOT NULL,
  source_name VARCHAR(180) NULL,
  fingerprint CHAR(64) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY crewcheck_roster_owner_key_uq (owner_email, roster_key),
  KEY crewcheck_roster_owner_active_idx (owner_email, active, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_hotel_rules (
  owner_email VARCHAR(254) NOT NULL,
  hotel_key VARCHAR(100) NOT NULL,
  hotel_name VARCHAR(180) NOT NULL,
  lead_minutes INT NOT NULL,
  sample_count INT NOT NULL DEFAULT 1,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (owner_email, hotel_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_stays (
  id VARCHAR(64) NOT NULL,
  owner_email VARCHAR(254) NOT NULL,
  roster_key VARCHAR(20) NULL,
  stay_date DATE NOT NULL,
  hotel_key VARCHAR(100) NOT NULL,
  hotel_name VARCHAR(180) NOT NULL,
  airport VARCHAR(8) NULL,
  room_cipher TEXT NULL,
  presentation_time VARCHAR(10) NULL,
  lead_minutes INT NULL,
  share_same_hotel TINYINT(1) NOT NULL DEFAULT 0,
  share_with_visitors TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY crewcheck_stay_owner_date_hotel_uq (owner_email, stay_date, hotel_key),
  KEY crewcheck_stay_roster_idx (owner_email, roster_key, stay_date),
  KEY crewcheck_stay_match_idx (hotel_key, stay_date, share_same_hotel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_shares (
  id VARCHAR(64) NOT NULL,
  owner_email VARCHAR(254) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  kind VARCHAR(40) NOT NULL DEFAULT 'roster',
  roster_key VARCHAR(20) NULL,
  permissions JSON NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY crewcheck_share_token_uq (token_hash),
  KEY crewcheck_share_owner_idx (owner_email, roster_key, expires_at),
  KEY crewcheck_share_active_idx (token_hash, revoked_at, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_visitors (
  id VARCHAR(64) NOT NULL,
  owner_email VARCHAR(254) NOT NULL,
  email VARCHAR(254) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  telegram VARCHAR(120) NULL,
  telegram_chat_id VARCHAR(120) NULL,
  telegram_token_hash CHAR(64) NULL,
  password_hash VARCHAR(255) NOT NULL,
  invite_token_hash CHAR(64) NOT NULL,
  permissions JSON NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'invited',
  must_change_password TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY crewcheck_visitor_owner_email_uq (owner_email, email),
  UNIQUE KEY crewcheck_visitor_invite_token_uq (invite_token_hash),
  UNIQUE KEY crewcheck_visitor_telegram_token_uq (telegram_token_hash),
  KEY crewcheck_visitors_email_idx (email, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_connections (
  id VARCHAR(64) NOT NULL,
  requester_email VARCHAR(254) NOT NULL,
  target_email VARCHAR(254) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  permissions JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY crewcheck_connection_pair_uq (requester_email, target_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_chat_threads (
  id VARCHAR(64) NOT NULL,
  direct_key VARCHAR(600) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY crewcheck_chat_direct_uq (direct_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_chat_messages (
  id VARCHAR(64) NOT NULL,
  thread_id VARCHAR(64) NOT NULL,
  sender_email VARCHAR(254) NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY crewcheck_chat_messages_idx (thread_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_gym_checkins (
  id VARCHAR(64) NOT NULL,
  owner_email VARCHAR(254) NOT NULL,
  gym_key VARCHAR(160) NOT NULL,
  gym_name VARCHAR(180) NOT NULL,
  chain_name VARCHAR(100) NULL,
  share_presence TINYINT(1) NOT NULL DEFAULT 0,
  checked_in_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY crewcheck_gym_live_idx (gym_key, expires_at, share_presence)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_webhook_events (
  provider VARCHAR(40) NOT NULL,
  event_id VARCHAR(255) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (provider, event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_emergencies (
  id VARCHAR(64) NOT NULL,
  visitor_id VARCHAR(64) NOT NULL,
  owner_email VARCHAR(254) NOT NULL,
  message TEXT NOT NULL,
  location_url TEXT NULL,
  channels JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY crewcheck_emergency_owner_idx (owner_email, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_telegram_state (
  state_key VARCHAR(255) NOT NULL,
  payload JSON NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (state_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_auth_attempts (
  identifier VARCHAR(254) NOT NULL,
  failures INT NOT NULL DEFAULT 0,
  window_started DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  blocked_until DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (identifier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_addresses (
  id VARCHAR(64) NOT NULL,
  owner_email VARCHAR(254) NOT NULL,
  label VARCHAR(120) NOT NULL,
  address_kind ENUM('home','contractual_base','virtual_base','directed_layover','other') NOT NULL,
  postal_code VARCHAR(20) NULL,
  formatted_address VARCHAR(500) NOT NULL,
  latitude DOUBLE NULL,
  longitude DOUBLE NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  metadata JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY crewcheck_addresses_owner_idx (owner_email, address_kind, is_default)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_user_hotels (
  id VARCHAR(64) NOT NULL,
  owner_email VARCHAR(254) NOT NULL,
  roster_key VARCHAR(20) NULL,
  stay_date DATE NULL,
  hotel_name VARCHAR(180) NOT NULL,
  postal_code VARCHAR(20) NULL,
  formatted_address VARCHAR(500) NULL,
  latitude DOUBLE NULL,
  longitude DOUBLE NULL,
  source VARCHAR(40) NOT NULL DEFAULT 'manual',
  metadata JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY crewcheck_user_hotels_owner_idx (owner_email, roster_key, stay_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_gym_preferences (
  id VARCHAR(64) NOT NULL,
  owner_email VARCHAR(254) NOT NULL,
  hotel_key VARCHAR(100) NULL,
  city_key VARCHAR(100) NULL,
  gym_key VARCHAR(160) NOT NULL,
  gym_name VARCHAR(180) NOT NULL,
  favorite TINYINT(1) NOT NULL DEFAULT 1,
  opening_hours JSON NULL,
  community_status JSON NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY crewcheck_gym_preference_uq (owner_email, hotel_key, gym_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_routine_preferences (
  owner_email VARCHAR(254) NOT NULL,
  activities JSON NOT NULL,
  constraints JSON NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (owner_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_parking_positions (
  id VARCHAR(64) NOT NULL,
  owner_email VARCHAR(254) NOT NULL,
  latitude DOUBLE NOT NULL,
  longitude DOUBLE NOT NULL,
  level_label VARCHAR(80) NULL,
  spot_label VARCHAR(80) NULL,
  notes JSON NULL,
  photo_url TEXT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  parked_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  cleared_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY crewcheck_parking_active_idx (owner_email, active, parked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_finance_configs (
  id VARCHAR(64) NOT NULL,
  scope ENUM('system','act','user') NOT NULL,
  owner_email VARCHAR(254) NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  currency CHAR(3) NOT NULL DEFAULT 'BRL',
  salary_rules JSON NOT NULL,
  per_diem_rules JSON NOT NULL,
  source_reference TEXT NULL,
  created_by VARCHAR(254) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY crewcheck_finance_effective_idx (scope, owner_email, effective_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_flight_follows (
  id VARCHAR(64) NOT NULL,
  owner_email VARCHAR(254) NOT NULL,
  flight_number VARCHAR(24) NOT NULL,
  flight_date DATE NOT NULL,
  origin VARCHAR(8) NULL,
  destination VARCHAR(8) NULL,
  notify_from DATETIME(3) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  last_snapshot JSON NULL,
  last_checked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY crewcheck_flight_follow_uq (owner_email, flight_number, flight_date),
  KEY crewcheck_flight_follow_due_idx (status, notify_from, last_checked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_swap_analyses (
  id VARCHAR(64) NOT NULL,
  requester_email VARCHAR(254) NOT NULL,
  roster_key VARCHAR(20) NOT NULL,
  offered_duty JSON NOT NULL,
  requested_duty JSON NOT NULL,
  rules_version VARCHAR(80) NOT NULL,
  result JSON NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'draft',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY crewcheck_swap_requester_idx (requester_email, roster_key, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_schedule_comparisons (
  id VARCHAR(64) NOT NULL,
  owner_email VARCHAR(254) NOT NULL,
  peer_email VARCHAR(254) NOT NULL,
  owner_roster_key VARCHAR(20) NOT NULL,
  peer_roster_key VARCHAR(20) NOT NULL,
  permissions JSON NOT NULL,
  result JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY crewcheck_schedule_comparison_idx (owner_email, peer_email, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO crewcheck_schema_migrations(version, description)
VALUES('20260715_003', 'CrewCheck Aiven MySQL full platform foundation')
ON DUPLICATE KEY UPDATE description=VALUES(description);
