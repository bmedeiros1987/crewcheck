CREATE TABLE IF NOT EXISTS crewcheck_regulatory_profile_periods (
  id CHAR(36) NOT NULL PRIMARY KEY,
  owner_email VARCHAR(320) NOT NULL,
  company VARCHAR(120) NOT NULL,
  crew_role ENUM('pilot','cabin') NOT NULL,
  fleet_group ENUM('wide_body','narrow_body','embraer') NULL,
  contractual_base VARCHAR(16) NOT NULL,
  virtual_base VARCHAR(16) NULL,
  contractual_airport VARCHAR(8) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT crewcheck_reg_profile_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT crewcheck_reg_profile_pilot_fleet CHECK (crew_role <> 'pilot' OR fleet_group IS NOT NULL),
  UNIQUE KEY crewcheck_reg_profile_start (owner_email, effective_from),
  KEY crewcheck_reg_profile_lookup (owner_email, effective_from, effective_to)
);

CREATE TABLE IF NOT EXISTS crewcheck_regulatory_documents (
  id VARCHAR(120) NOT NULL PRIMARY KEY,
  document_type ENUM('ACT','CCT','LAW','RBAC') NOT NULL,
  title VARCHAR(500) NOT NULL,
  official_uri VARCHAR(1000) NULL,
  official_identifier VARCHAR(255) NULL,
  content_sha256 CHAR(64) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  verified_at TIMESTAMP(3) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT crewcheck_reg_document_source CHECK (official_uri IS NOT NULL OR official_identifier IS NOT NULL),
  CONSTRAINT crewcheck_reg_document_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE IF NOT EXISTS crewcheck_regulatory_rules (
  id VARCHAR(180) NOT NULL PRIMARY KEY,
  document_id VARCHAR(120) NOT NULL,
  subject VARCHAR(120) NOT NULL,
  scope_json JSON NOT NULL,
  effect ENUM('replace','minimum','maximum','informational') NOT NULL DEFAULT 'replace',
  mandatory TINYINT(1) NOT NULL DEFAULT 0,
  value_json JSON NOT NULL,
  clause_or_article VARCHAR(120) NOT NULL,
  page_number INT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT crewcheck_reg_rule_page CHECK (page_number > 0),
  CONSTRAINT crewcheck_reg_rule_document FOREIGN KEY (document_id) REFERENCES crewcheck_regulatory_documents(id),
  KEY crewcheck_reg_rule_subject (subject, document_id)
);

CREATE TABLE IF NOT EXISTS crewcheck_regulatory_decisions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  owner_email VARCHAR(320) NOT NULL,
  as_of_date DATE NOT NULL,
  intent VARCHAR(120) NOT NULL,
  profile_period_id CHAR(36) NOT NULL,
  rule_id VARCHAR(180) NOT NULL,
  facts_json JSON NOT NULL,
  result_json JSON NOT NULL,
  calculation_json JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT crewcheck_reg_decision_profile FOREIGN KEY (profile_period_id) REFERENCES crewcheck_regulatory_profile_periods(id),
  CONSTRAINT crewcheck_reg_decision_rule FOREIGN KEY (rule_id) REFERENCES crewcheck_regulatory_rules(id),
  KEY crewcheck_reg_decision_owner (owner_email, created_at)
);

