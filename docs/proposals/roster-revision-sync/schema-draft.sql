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

-- Histórico imutável: cada geração aceita (importação ou exclusão que muda o estado) vira uma linha.
-- Só mudança real entra aqui; no-op, conflito e recusa não criam revisão.
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
  -- legacy_confirmed: envio legado aplicado só após confirmação explícita com geração vista.
  -- legacy_backfill: ensaio de backfill aditivo (só cria competência ausente); ainda desenho.
  source_kind ENUM('pdf_import','telegram','legacy_create','legacy_confirmed','legacy_backfill') NOT NULL,
  client_operation_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (revision_id),
  UNIQUE KEY crewcheck_roster_revision_operation_uq (owner_email, client_operation_id),
  UNIQUE KEY crewcheck_roster_revision_generation_uq (owner_email, crew_key, roster_key, roster_kind, generation),
  KEY crewcheck_roster_revision_competence_idx (owner_email, crew_key, roster_key, roster_kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Recibo de operação: UMA linha por client_operation_id decidido sob a trava da competência, para
-- TODO resultado (aplicada, sem mudança, conflito, recusa), gravada na MESMA transação da revisão e
-- da competência. É a única autoridade de replay: o reenvio do mesmo id devolve a resposta ORIGINAL
-- gravada em `response` (nunca o estado atual como ACK antigo); o mesmo id com outro request_hash
-- é recusado (OPERATION_ID_REUSED).
-- Retenção fail-closed: nenhum expurgo existe. Um expurgo futuro exige fencing server-side (por
-- exemplo, época monotônica incluída na requisição e recusa de épocas anteriores à mais antiga
-- retida); sem isso, apagar recibos permitiria reaplicar um id antigo como novo.
CREATE TABLE IF NOT EXISTS crewcheck_roster_operation_receipts (
  owner_email VARCHAR(254) NOT NULL,
  client_operation_id CHAR(36) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  crew_key VARCHAR(48) NOT NULL,
  roster_key CHAR(7) NOT NULL,
  roster_kind ENUM('planned','operated') NOT NULL,
  outcome ENUM('applied','unchanged','conflict','rejected') NOT NULL,
  response JSON NOT NULL,
  generation_at_decision BIGINT UNSIGNED NOT NULL,
  revision_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (owner_email, client_operation_id),
  KEY crewcheck_roster_receipt_competence_idx (owner_email, crew_key, roster_key, roster_kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Envio de cliente legado (sem base/operation id) sobre competência que já existe ou foi excluída:
-- NUNCA é aplicado às cegas. Fica pendente, gravado na mesma transação do recibo (428), e só vira
-- revisão quando um cliente com revisão o confirma explicitamente com a geração que viu e um
-- operation id novo (mesmo CAS de qualquer escrita). Descartar também é escolha explícita.
-- submission_id = operation id determinístico do pedido legado (conta, tripulante, competência, conteúdo).
CREATE TABLE IF NOT EXISTS crewcheck_roster_legacy_submissions (
  owner_email VARCHAR(254) NOT NULL,
  submission_id CHAR(36) NOT NULL,
  crew_key VARCHAR(48) NOT NULL,
  roster_key CHAR(7) NOT NULL,
  roster_kind ENUM('planned','operated') NOT NULL,
  content_hash CHAR(64) NOT NULL,
  roster JSON NOT NULL,
  generation_observed BIGINT UNSIGNED NOT NULL,
  status ENUM('pending','confirmed','dismissed') NOT NULL DEFAULT 'pending',
  resolved_operation_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (owner_email, submission_id),
  KEY crewcheck_roster_legacy_submission_status_idx (owner_email, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ensaio de backfill (desenho, não aplicado): linhas legadas que não podem ser chaveadas com
-- segurança (sem vínculo autoritativo da conta, matrícula ausente ou divergente, escala incompleta)
-- ficam em quarentena, nunca são chaveadas por nome. Idempotente por (conta, linha, fingerprint).
CREATE TABLE IF NOT EXISTS crewcheck_roster_backfill_quarantine (
  owner_email VARCHAR(254) NOT NULL,
  legacy_row_id VARCHAR(64) NOT NULL,
  legacy_fingerprint CHAR(64) NOT NULL,
  reason VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (owner_email, legacy_row_id, legacy_fingerprint)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
