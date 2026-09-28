-- CrewCheck #399 -- Termos/Privacidade: acentuacao PT-BR corrigida (Versao 1) +
-- trilha explicita de revisao material/cosmetica.
--
-- Duas coisas nesta migration:
-- 1) crewcheck_platform_terms ganha "revision" (revisao dentro da mesma version)
--    e "material" (0/1). Permite republicar um texto corrigido sem invalidar
--    aceites anteriores quando a mudanca e so cosmetica (ex.: acentuacao),
--    preservando o historico completo de cada revisao para auditoria. A version
--    UNIQUE anterior vira (version, revision) UNIQUE, para caber mais de uma
--    revisao na mesma version.
-- 2) Publica a revisao 2 da Versao 1: mesma substancia/mesmas clausulas do texto
--    original (migrations/20260715_004), so com acentuacao corrigida em PT-BR e
--    sem a nota interna de revisao juridica que havia ficado no corpo visivel ao
--    usuario ("Este texto deve passar por revisao juridica antes da divulgacao
--    comercial."). material=0 (cosmetica) -- quem ja aceitou a revisao 1
--    continua com o aceite valido; version continua 1.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE crewcheck_platform_terms
  DROP INDEX version,
  ADD COLUMN revision INT NOT NULL DEFAULT 1 AFTER version,
  ADD COLUMN material TINYINT(1) NOT NULL DEFAULT 1 AFTER content_hash,
  ADD UNIQUE KEY crewcheck_terms_version_revision_uq (version, revision);

SET @crewcheck_terms_body_v1r2 = 'TERMOS DE USO E PRIVACIDADE CREWCHECK\n\nO CrewCheck é uma ferramenta de apoio ao tripulante e não substitui documentos oficiais da companhia, decisões operacionais, orientações médicas ou análise jurídica. O usuário é responsável por conferir escala, apresentação, portão, regulamentação, transporte, rede credenciada e demais dados nas fontes oficiais.\n\nO tratamento de dados segue finalidade, necessidade, segurança e transparência. Credenciais corporativas, senhas e MFA não devem ser armazenados. O titular pode solicitar acesso, exportação, correção e exclusão dos dados, observadas obrigações legais de conservação.\n\nÉ proibido enviar conteúdo ilegal, abusivo, malicioso, de exploração sexual infantil, credenciais de terceiros ou material sem autorização. Conteúdo proibido pode ser recusado, removido e tratado conforme a legislação aplicável.\n\nIntegrações externas dependem de disponibilidade e autorização dos respectivos provedores. O usuário autoriza somente os tratamentos necessários aos recursos escolhidos e pode revogar permissões quando aplicável.\n\nAo aceitar, o usuário confirma que leu esta versão. Uma alteração material exigirá novo aceite.';

UPDATE crewcheck_platform_terms SET status='superseded' WHERE id='terms-1-initial' AND status='published';

INSERT INTO crewcheck_platform_terms(
  id, version, revision, title, body_text, content_hash, material, status,
  published_at, effective_at, created_by
) VALUES (
  'terms-1-2-cosmetic-accent-fix', 1, 2, 'Termos de Uso e Privacidade CrewCheck',
  @crewcheck_terms_body_v1r2, SHA2(@crewcheck_terms_body_v1r2, 256), 0, 'published',
  NOW(3), NOW(3), 'system'
) ON DUPLICATE KEY UPDATE id=id;

INSERT INTO crewcheck_schema_migrations(version, description)
VALUES('20260816_019', 'CrewCheck terms: material/cosmetic revision trail + PT-BR accent fix (v1 revision 2)')
ON DUPLICATE KEY UPDATE description=VALUES(description);
