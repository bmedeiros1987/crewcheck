-- CrewCheck P-1 Auth — narrow lookup hardening for single-use link tokens.
-- Adds only the index required by consumeAuthArtifact(purpose + token_hash).
-- No account, session, password, roster or parser data is mutated.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE crewcheck_platform_auth_artifacts
  ADD KEY crewcheck_auth_artifact_token_lookup_idx (purpose, token_hash);

INSERT IGNORE INTO crewcheck_schema_migrations(version, description)
VALUES ('20260813_016', 'P-1 Auth artifact purpose/token hash lookup index');
