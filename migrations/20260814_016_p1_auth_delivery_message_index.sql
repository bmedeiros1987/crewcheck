-- CrewCheck P-1 Auth — provider delivery correlation index.
-- Forward-only migration; does not enable public recovery/verification behavior.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE crewcheck_platform_auth_artifacts
  ADD KEY crewcheck_auth_artifact_message_idx (delivery_message_id);

INSERT IGNORE INTO crewcheck_schema_migrations(version, description)
VALUES ('20260814_016', 'P-1 Auth provider delivery message correlation index');
