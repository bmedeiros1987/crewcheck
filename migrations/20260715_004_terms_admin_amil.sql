-- CrewCheck v13.8.8 - Term acceptance and administration on Aiven MySQL
-- Idempotent migration for installations that already ran 20260715_003.

CREATE TABLE IF NOT EXISTS crewcheck_platform_terms (
  id VARCHAR(80) PRIMARY KEY,
  version INT NOT NULL UNIQUE,
  title VARCHAR(180) NOT NULL,
  body_text LONGTEXT NOT NULL,
  content_hash CHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  published_at DATETIME(3) NULL,
  effective_at DATETIME(3) NULL,
  created_by VARCHAR(320) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX crewcheck_platform_terms_status_idx(status, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crewcheck_platform_terms_acceptances (
  email VARCHAR(320) NOT NULL,
  terms_id VARCHAR(80) NOT NULL,
  terms_version INT NOT NULL,
  content_hash CHAR(64) NOT NULL,
  accepted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ip_hash CHAR(64) NULL,
  user_agent_hash CHAR(64) NULL,
  PRIMARY KEY(email, terms_id),
  INDEX crewcheck_terms_acceptance_version_idx(terms_version, accepted_at),
  CONSTRAINT crewcheck_terms_acceptance_terms_fk
    FOREIGN KEY (terms_id) REFERENCES crewcheck_platform_terms(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @crewcheck_terms_body = 'TERMOS DE USO E PRIVACIDADE CREWCHECK\n\nO CrewCheck e uma ferramenta de apoio ao tripulante e nao substitui documentos oficiais da companhia, decisoes operacionais, orientacoes medicas ou analise juridica. O usuario e responsavel por conferir escala, apresentacao, portao, regulamentacao, transporte, rede credenciada e demais dados nas fontes oficiais.\n\nO tratamento de dados segue finalidade, necessidade, seguranca e transparencia. Credenciais corporativas, senhas e MFA nao devem ser armazenados. O titular pode solicitar acesso, exportacao, correcao e exclusao dos dados, observadas obrigacoes legais de conservacao.\n\nE proibido enviar conteudo ilegal, abusivo, malicioso, de exploracao sexual infantil, credenciais de terceiros ou material sem autorizacao. Conteudo proibido pode ser recusado, removido e tratado conforme a legislacao aplicavel.\n\nIntegracoes externas dependem de disponibilidade e autorizacao dos respectivos provedores. O usuario autoriza somente os tratamentos necessarios aos recursos escolhidos e pode revogar permissoes quando aplicavel.\n\nAo aceitar, o usuario confirma que leu esta versao. Uma alteracao material exigira novo aceite. Este texto deve passar por revisao juridica antes da divulgacao comercial.';

INSERT INTO crewcheck_platform_terms(
  id, version, title, body_text, content_hash, status,
  published_at, effective_at, created_by
) VALUES (
  'terms-1-initial', 1, 'Termos de Uso e Privacidade CrewCheck',
  @crewcheck_terms_body, SHA2(@crewcheck_terms_body, 256), 'published',
  NOW(3), NOW(3), 'system'
) ON DUPLICATE KEY UPDATE id=id;

INSERT INTO crewcheck_schema_migrations(version, description)
VALUES('20260715_004', 'CrewCheck terms acceptance and admin foundation')
ON DUPLICATE KEY UPDATE description=VALUES(description);
