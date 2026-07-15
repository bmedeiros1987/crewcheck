-- CrewCheck 13.8.x
-- Aiven MySQL: perfil/ID, assinatura, uso, escala ativa, pernoites e QR revogavel.
-- Idempotente: pode ser executada novamente sem apagar dados.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

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
  KEY crewcheck_stay_roster_idx (owner_email, roster_key),
  KEY crewcheck_stay_match_idx (hotel_key, stay_date, share_same_hotel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_shares (
  id VARCHAR(64) NOT NULL,
  owner_email VARCHAR(254) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  kind VARCHAR(40) NOT NULL,
  roster_key VARCHAR(20) NULL,
  permissions JSON NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY crewcheck_share_token_uq (token_hash),
  KEY crewcheck_share_owner_idx (owner_email, created_at),
  KEY crewcheck_share_active_idx (token_hash, revoked_at, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
