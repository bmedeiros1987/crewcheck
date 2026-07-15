-- CrewCheck PostgreSQL repair: public user ID and revocable roster QR shares
-- Idempotent. Run against the same PostgreSQL database configured in DATABASE_URL.

BEGIN;

CREATE TABLE IF NOT EXISTS crewcheck_schema_migrations (
  version TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crewcheck_platform_profiles (
  email TEXT PRIMARY KEY,
  public_id TEXT,
  display_name TEXT,
  locale TEXT,
  timezone TEXT,
  plan TEXT,
  share_presence BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

ALTER TABLE crewcheck_platform_profiles ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE crewcheck_platform_profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE crewcheck_platform_profiles ADD COLUMN IF NOT EXISTS locale TEXT;
ALTER TABLE crewcheck_platform_profiles ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE crewcheck_platform_profiles ADD COLUMN IF NOT EXISTS plan TEXT;
ALTER TABLE crewcheck_platform_profiles ADD COLUMN IF NOT EXISTS share_presence BOOLEAN;
ALTER TABLE crewcheck_platform_profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE crewcheck_platform_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE crewcheck_platform_profiles
SET
  display_name = COALESCE(NULLIF(BTRIM(display_name), ''), SPLIT_PART(email, '@', 1), 'Tripulante'),
  locale = COALESCE(NULLIF(BTRIM(locale), ''), 'pt-BR'),
  timezone = COALESCE(NULLIF(BTRIM(timezone), ''), 'America/Sao_Paulo'),
  plan = COALESCE(NULLIF(BTRIM(plan), ''), 'free'),
  share_presence = COALESCE(share_presence, FALSE),
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW());

DO $$
DECLARE
  profile_row RECORD;
  raw_id TEXT;
  candidate TEXT;
BEGIN
  FOR profile_row IN
    SELECT email
    FROM crewcheck_platform_profiles
    WHERE public_id IS NULL OR BTRIM(public_id) = ''
    ORDER BY email
  LOOP
    LOOP
      raw_id := UPPER(TRANSLATE(SUBSTRING(MD5(profile_row.email || CLOCK_TIMESTAMP()::TEXT || RANDOM()::TEXT), 1, 8), '01', 'XY'));
      candidate := 'CC-' || SUBSTRING(raw_id, 1, 4) || '-' || SUBSTRING(raw_id, 5, 4);
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM crewcheck_platform_profiles WHERE public_id = candidate
      );
    END LOOP;

    UPDATE crewcheck_platform_profiles
    SET public_id = candidate, updated_at = NOW()
    WHERE email = profile_row.email;
  END LOOP;
END $$;

ALTER TABLE crewcheck_platform_profiles ALTER COLUMN public_id SET NOT NULL;
ALTER TABLE crewcheck_platform_profiles ALTER COLUMN display_name SET NOT NULL;
ALTER TABLE crewcheck_platform_profiles ALTER COLUMN locale SET DEFAULT 'pt-BR';
ALTER TABLE crewcheck_platform_profiles ALTER COLUMN locale SET NOT NULL;
ALTER TABLE crewcheck_platform_profiles ALTER COLUMN timezone SET DEFAULT 'America/Sao_Paulo';
ALTER TABLE crewcheck_platform_profiles ALTER COLUMN timezone SET NOT NULL;
ALTER TABLE crewcheck_platform_profiles ALTER COLUMN plan SET DEFAULT 'free';
ALTER TABLE crewcheck_platform_profiles ALTER COLUMN plan SET NOT NULL;
ALTER TABLE crewcheck_platform_profiles ALTER COLUMN share_presence SET DEFAULT FALSE;
ALTER TABLE crewcheck_platform_profiles ALTER COLUMN share_presence SET NOT NULL;
ALTER TABLE crewcheck_platform_profiles ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE crewcheck_platform_profiles ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE crewcheck_platform_profiles ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE crewcheck_platform_profiles ALTER COLUMN updated_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crewcheck_platform_profiles_public_id_idx
  ON crewcheck_platform_profiles(public_id);

CREATE TABLE IF NOT EXISTS crewcheck_platform_shares (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL DEFAULT 'roster',
  roster_key TEXT,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE crewcheck_platform_shares ADD COLUMN IF NOT EXISTS id TEXT;
ALTER TABLE crewcheck_platform_shares ADD COLUMN IF NOT EXISTS owner_email TEXT;
ALTER TABLE crewcheck_platform_shares ADD COLUMN IF NOT EXISTS token_hash TEXT;
ALTER TABLE crewcheck_platform_shares ADD COLUMN IF NOT EXISTS kind TEXT;
ALTER TABLE crewcheck_platform_shares ADD COLUMN IF NOT EXISTS roster_key TEXT;
ALTER TABLE crewcheck_platform_shares ADD COLUMN IF NOT EXISTS permissions JSONB;
ALTER TABLE crewcheck_platform_shares ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE crewcheck_platform_shares ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE crewcheck_platform_shares ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

-- Rows from an incomplete legacy table without an owner cannot be recovered safely.
DELETE FROM crewcheck_platform_shares
WHERE owner_email IS NULL OR BTRIM(owner_email) = '';

UPDATE crewcheck_platform_shares
SET
  id = COALESCE(NULLIF(BTRIM(id), ''), 'share-' || MD5(owner_email || CLOCK_TIMESTAMP()::TEXT || RANDOM()::TEXT)),
  token_hash = COALESCE(NULLIF(BTRIM(token_hash), ''), MD5(owner_email || RANDOM()::TEXT) || MD5(CLOCK_TIMESTAMP()::TEXT || RANDOM()::TEXT)),
  kind = COALESCE(NULLIF(BTRIM(kind), ''), 'roster'),
  permissions = COALESCE(permissions, '{}'::jsonb),
  expires_at = COALESCE(expires_at, NOW()),
  revoked_at = CASE WHEN token_hash IS NULL OR BTRIM(token_hash) = '' THEN COALESCE(revoked_at, NOW()) ELSE revoked_at END,
  created_at = COALESCE(created_at, NOW());

ALTER TABLE crewcheck_platform_shares ALTER COLUMN id SET NOT NULL;
ALTER TABLE crewcheck_platform_shares ALTER COLUMN owner_email SET NOT NULL;
ALTER TABLE crewcheck_platform_shares ALTER COLUMN token_hash SET NOT NULL;
ALTER TABLE crewcheck_platform_shares ALTER COLUMN kind SET DEFAULT 'roster';
ALTER TABLE crewcheck_platform_shares ALTER COLUMN kind SET NOT NULL;
ALTER TABLE crewcheck_platform_shares ALTER COLUMN permissions SET DEFAULT '{}'::jsonb;
ALTER TABLE crewcheck_platform_shares ALTER COLUMN permissions SET NOT NULL;
ALTER TABLE crewcheck_platform_shares ALTER COLUMN expires_at SET NOT NULL;
ALTER TABLE crewcheck_platform_shares ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE crewcheck_platform_shares ALTER COLUMN created_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crewcheck_platform_shares_id_idx
  ON crewcheck_platform_shares(id);
CREATE UNIQUE INDEX IF NOT EXISTS crewcheck_platform_shares_token_hash_idx
  ON crewcheck_platform_shares(token_hash);
CREATE INDEX IF NOT EXISTS crewcheck_platform_shares_owner_idx
  ON crewcheck_platform_shares(owner_email, roster_key, expires_at DESC);

INSERT INTO crewcheck_schema_migrations(version, description)
VALUES('20260714_002', 'Repair PostgreSQL profile public IDs and roster QR shares')
ON CONFLICT(version) DO NOTHING;

COMMIT;
