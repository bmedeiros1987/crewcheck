CREATE TABLE IF NOT EXISTS crewcheck_financial_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('per_diem','payroll')),
  competence text NOT NULL,
  source_fingerprint text NOT NULL,
  original_filename text NOT NULL,
  parsed_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_email, source_fingerprint)
);

CREATE TABLE IF NOT EXISTS crewcheck_financial_learned_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email text NOT NULL,
  rate_key text NOT NULL,
  label text NOT NULL,
  value numeric(18,6) NOT NULL CHECK (value >= 0),
  unit text NOT NULL CHECK (unit IN ('meal','hour','km','month','amount')),
  currency text NOT NULL CHECK (currency IN ('BRL','USD','EUR','GBP')),
  effective_from date NOT NULL,
  effective_to date,
  source_fingerprint text NOT NULL,
  confidence text NOT NULL CHECK (confidence IN ('high','medium','review')),
  confirmed boolean NOT NULL DEFAULT false,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_email, rate_key, effective_from, source_fingerprint),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS crewcheck_financial_rates_lookup
  ON crewcheck_financial_learned_rates(owner_email, rate_key, effective_from DESC)
  WHERE confirmed = true;

-- LGPD: nunca armazenar texto integral do PDF, dados bancários ou identificadores
-- desnecessários. O parsed_summary deve conter somente competência, totais e rubricas.
