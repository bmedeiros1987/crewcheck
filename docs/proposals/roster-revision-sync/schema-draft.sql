-- PROPOSTA — NÃO APLICAR. Este arquivo NÃO é uma migração e fica fora de migrations/ de propósito.
-- Rascunho para revisão: revisão monotônica por competência, identidade estável e histórico.
-- Só é executado em banco descartável pelo teste scripts/regression-roster-revision-sync-proposal.mjs.
-- Uma migração real exige backup, revisão independente e aprovação específica.

-- Estado atual de cada competência: uma linha por conta + tripulante (chave ID: vinculada à conta por
-- fonte autoritativa server-side — pré-condição não implementada; nunca o nome nem só a matrícula do PDF)
-- + competência + tipo (planejada/operada). "generation" só cresce, inclusive na exclusão
-- (tombstone), então nenhuma escrita baseada numa geração antiga é aceita depois de
-- A→B→A, de exclusão/recriação ou de replay.
CREATE TABLE IF NOT EXISTS crewcheck_roster_competences (
  owner_email VARCHAR(254) NOT NULL,
  crew_key VARCHAR(48) NOT NULL,
  roster_key CHAR(7) NOT NULL,
  roster_kind ENUM('planned','operated') NOT NULL,
  generation BIGINT UNSIGNED NOT NULL DEFAULT 0,
  state ENUM('absent','live','deleted') NOT NULL DEFAULT 'absent',
  current_revision_id CHAR(36) NULL,
  content_hash CHAR(64) NULL,
  -- Informativo apenas; nenhuma decisão de ordem usa relógio (cliente ou servidor).
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (owner_email, crew_key, roster_key, roster_kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Histórico imutável: cada geração aceita (importação ou exclusão) vira uma linha.
-- client_operation_id torna o reenvio após ACK incerto idempotente sem depender de hash.
CREATE TABLE IF NOT EXISTS crewcheck_roster_revisions (
  revision_id CHAR(36) NOT NULL,
  owner_email VARCHAR(254) NOT NULL,
  crew_key VARCHAR(48) NOT NULL,
  roster_key CHAR(7) NOT NULL,
  roster_kind ENUM('planned','operated') NOT NULL,
  generation BIGINT UNSIGNED NOT NULL,
  base_generation BIGINT UNSIGNED NOT NULL,
  operation ENUM('import','delete') NOT NULL,
  content_hash CHAR(64) NULL,
  roster JSON NULL,
  parser_version VARCHAR(40) NOT NULL,
  schema_version SMALLINT UNSIGNED NOT NULL,
  source_kind ENUM('pdf_import','telegram','legacy_create') NOT NULL,
  client_operation_id CHAR(36) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (revision_id),
  UNIQUE KEY crewcheck_roster_revision_operation_uq (owner_email, client_operation_id),
  UNIQUE KEY crewcheck_roster_revision_generation_uq (owner_email, crew_key, roster_key, roster_kind, generation),
  KEY crewcheck_roster_revision_competence_idx (owner_email, crew_key, roster_key, roster_kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
