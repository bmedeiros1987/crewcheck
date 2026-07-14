-- CrewCheck v14 database foundation
-- Idempotent PostgreSQL/Supabase migration. Run with the same database used by DATABASE_URL.

BEGIN;

CREATE TABLE IF NOT EXISTS crewcheck_schema_migrations (
  version TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crewcheck_platform_profiles (
  email TEXT PRIMARY KEY,
  public_id TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'pt-BR',
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  plan TEXT NOT NULL DEFAULT 'free',
  share_presence BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crewcheck_platform_subscriptions (
  email TEXT PRIMARY KEY,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  product_id TEXT,
  provider_ref TEXT,
  purchase_token_hash TEXT,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS crewcheck_platform_purchase_token_idx
  ON crewcheck_platform_subscriptions(purchase_token_hash)
  WHERE purchase_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS crewcheck_platform_usage (
  email TEXT NOT NULL,
  month_key TEXT NOT NULL,
  usage_kind TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  limit_value INTEGER NOT NULL CHECK (limit_value >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(email, month_key, usage_kind)
);

CREATE TABLE IF NOT EXISTS crewcheck_platform_rosters (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  roster_key TEXT NOT NULL,
  roster JSONB NOT NULL,
  compliance JSONB NOT NULL DEFAULT '{}'::jsonb,
  gym JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_name TEXT,
  fingerprint TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_email, roster_key)
);
ALTER TABLE crewcheck_platform_rosters ADD COLUMN IF NOT EXISTS gym JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS crewcheck_platform_rosters_owner_idx
  ON crewcheck_platform_rosters(owner_email, active, updated_at DESC);

CREATE TABLE IF NOT EXISTS crewcheck_platform_hotel_rules (
  owner_email TEXT NOT NULL,
  hotel_key TEXT NOT NULL,
  hotel_name TEXT NOT NULL,
  lead_minutes INTEGER NOT NULL CHECK (lead_minutes BETWEEN 0 AND 720),
  sample_count INTEGER NOT NULL DEFAULT 1 CHECK (sample_count > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(owner_email, hotel_key)
);

CREATE TABLE IF NOT EXISTS crewcheck_platform_stays (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  roster_key TEXT,
  stay_date DATE NOT NULL,
  hotel_key TEXT NOT NULL,
  hotel_name TEXT NOT NULL,
  airport TEXT,
  room_cipher TEXT,
  presentation_time TEXT,
  lead_minutes INTEGER,
  share_same_hotel BOOLEAN NOT NULL DEFAULT FALSE,
  share_with_visitors BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_email, stay_date, hotel_key)
);
CREATE INDEX IF NOT EXISTS crewcheck_platform_stays_match_idx
  ON crewcheck_platform_stays(hotel_key, stay_date, share_same_hotel);
CREATE INDEX IF NOT EXISTS crewcheck_platform_stays_roster_idx
  ON crewcheck_platform_stays(owner_email, roster_key, stay_date);

CREATE TABLE IF NOT EXISTS crewcheck_platform_shares (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL,
  roster_key TEXT,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS crewcheck_platform_shares_owner_idx
  ON crewcheck_platform_shares(owner_email, roster_key, expires_at DESC);

CREATE TABLE IF NOT EXISTS crewcheck_platform_visitors (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  telegram TEXT,
  telegram_chat_id TEXT,
  telegram_token_hash TEXT,
  password_hash TEXT NOT NULL,
  invite_token_hash TEXT UNIQUE NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'invited',
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_email, email)
);
ALTER TABLE crewcheck_platform_visitors ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
ALTER TABLE crewcheck_platform_visitors ADD COLUMN IF NOT EXISTS telegram_token_hash TEXT;
CREATE INDEX IF NOT EXISTS crewcheck_platform_visitors_email_idx
  ON crewcheck_platform_visitors(email, status);
CREATE UNIQUE INDEX IF NOT EXISTS crewcheck_platform_visitor_telegram_token_idx
  ON crewcheck_platform_visitors(telegram_token_hash)
  WHERE telegram_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS crewcheck_platform_connections (
  id TEXT PRIMARY KEY,
  requester_email TEXT NOT NULL,
  target_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(requester_email, target_email)
);

CREATE TABLE IF NOT EXISTS crewcheck_platform_chat_threads (
  id TEXT PRIMARY KEY,
  direct_key TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crewcheck_platform_chat_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS crewcheck_platform_chat_messages_idx
  ON crewcheck_platform_chat_messages(thread_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crewcheck_platform_gym_checkins (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  gym_key TEXT NOT NULL,
  gym_name TEXT NOT NULL,
  chain_name TEXT,
  share_presence BOOLEAN NOT NULL DEFAULT FALSE,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS crewcheck_platform_gym_live_idx
  ON crewcheck_platform_gym_checkins(gym_key, expires_at, share_presence);

CREATE TABLE IF NOT EXISTS crewcheck_platform_webhook_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(provider, event_id)
);

CREATE TABLE IF NOT EXISTS crewcheck_platform_emergencies (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  message TEXT NOT NULL,
  location_url TEXT,
  channels JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crewcheck_telegram_state (
  state_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crewcheck_platform_auth_attempts (
  identifier TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0 CHECK (failures >= 0),
  window_started TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Stable storage for the next operational modules. Values remain user-owned and
-- are only exposed through authenticated server endpoints.
CREATE TABLE IF NOT EXISTS crewcheck_platform_addresses (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  label TEXT NOT NULL,
  address_kind TEXT NOT NULL CHECK (address_kind IN ('home','contractual_base','virtual_base','directed_layover','other')),
  postal_code TEXT,
  formatted_address TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS crewcheck_platform_addresses_owner_idx
  ON crewcheck_platform_addresses(owner_email, address_kind, is_default DESC);

CREATE TABLE IF NOT EXISTS crewcheck_platform_user_hotels (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  roster_key TEXT,
  stay_date DATE,
  hotel_name TEXT NOT NULL,
  postal_code TEXT,
  formatted_address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  source TEXT NOT NULL DEFAULT 'manual',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS crewcheck_platform_user_hotels_owner_idx
  ON crewcheck_platform_user_hotels(owner_email, roster_key, stay_date);

CREATE TABLE IF NOT EXISTS crewcheck_platform_gym_preferences (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  hotel_key TEXT,
  city_key TEXT,
  gym_key TEXT NOT NULL,
  gym_name TEXT NOT NULL,
  favorite BOOLEAN NOT NULL DEFAULT TRUE,
  opening_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  community_status JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_email, hotel_key, gym_key)
);

CREATE TABLE IF NOT EXISTS crewcheck_platform_routine_preferences (
  owner_email TEXT PRIMARY KEY,
  activities JSONB NOT NULL DEFAULT '[]'::jsonb,
  constraints JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crewcheck_platform_parking_positions (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  level_label TEXT,
  spot_label TEXT,
  notes TEXT,
  photo_url TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  parked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cleared_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS crewcheck_platform_parking_active_idx
  ON crewcheck_platform_parking_positions(owner_email, active, parked_at DESC);

CREATE TABLE IF NOT EXISTS crewcheck_platform_finance_configs (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('system','act','user')),
  owner_email TEXT,
  effective_from DATE NOT NULL,
  effective_to DATE,
  currency TEXT NOT NULL DEFAULT 'BRL',
  salary_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  per_diem_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_reference TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS crewcheck_platform_finance_effective_idx
  ON crewcheck_platform_finance_configs(scope, owner_email, effective_from DESC);

CREATE TABLE IF NOT EXISTS crewcheck_platform_flight_follows (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  flight_number TEXT NOT NULL,
  flight_date DATE NOT NULL,
  origin TEXT,
  destination TEXT,
  notify_from TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  last_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_email, flight_number, flight_date)
);
CREATE INDEX IF NOT EXISTS crewcheck_platform_flight_follow_due_idx
  ON crewcheck_platform_flight_follows(status, notify_from, last_checked_at);

CREATE TABLE IF NOT EXISTS crewcheck_platform_swap_analyses (
  id TEXT PRIMARY KEY,
  requester_email TEXT NOT NULL,
  roster_key TEXT NOT NULL,
  offered_duty JSONB NOT NULL,
  requested_duty JSONB NOT NULL,
  rules_version TEXT NOT NULL,
  result JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crewcheck_platform_schedule_comparisons (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  peer_email TEXT NOT NULL,
  owner_roster_key TEXT NOT NULL,
  peer_roster_key TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

INSERT INTO crewcheck_schema_migrations(version, description)
VALUES('20260713_001', 'CrewCheck v14 database and operational foundation')
ON CONFLICT(version) DO NOTHING;

COMMIT;
