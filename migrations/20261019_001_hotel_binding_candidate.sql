-- REVIEW-ONLY CANDIDATE. NOT EXECUTED. DO NOT ADD TO AUTO-MIGRATION/STARTUP.
-- Deployment requires separate schema review and coordinated writers first.
-- No backfill: NULL is unknown provenance, not evidence of manual origin.
-- Existing PK, legacy unique index, room and grants remain unchanged.
ALTER TABLE crewcheck_platform_stays
  ADD COLUMN binding_id VARCHAR(64) NULL,
  ADD COLUMN binding_evidence JSON NULL,
  ADD COLUMN manual_hotel_override JSON NULL,
  ADD COLUMN hotel_source_snapshot JSON NULL,
  ADD COLUMN row_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  ADD UNIQUE KEY uq_stays_owner_binding (owner_email, binding_id);
-- Application validates JSON shape/version, ownership, exact existing-row binding,
-- bounded names/references and CAS. No source JSON may hold credentials or HTML.
-- Do not DROP columns on rollback: that would destroy explicit provenance.
