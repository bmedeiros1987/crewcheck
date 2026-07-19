-- CrewCheck v14.0.2 — Termos completos em UTF-8, LGPD e integração Google Calendar
-- Migração idempotente para Aiven MySQL.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE crewcheck_platform_terms
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE crewcheck_platform_terms_acceptances
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @crewcheck_terms_title = 'Termos de Uso e Política de Privacidade CrewCheck — versão Google Calendar';
SET @crewcheck_terms_body = 'TERMOS DE USO E POLÍTICA DE PRIVACIDADE CREWCHECK

Última atualização: 19 de julho de 2026.

1. IDENTIFICAÇÃO, OBJETO E ACEITAÇÃO

Estes Termos regulam o acesso ao CrewCheck, incluindo site, PWA, aplicativo Android, Concierge, relatórios, alertas e integrações opcionais. Ao criar uma conta, marcar a caixa de aceite ou continuar usando uma versão que exija novo aceite, o usuário declara ter lido e compreendido este documento. O aceite é registrado com versão, data e hora, hash do conteúdo e identificadores técnicos de auditoria protegidos por hash. Alterações materiais exigirão novo aceite.

O CrewCheck é uma ferramenta de produtividade e apoio pessoal para tripulantes. Organiza escalas enviadas pelo próprio usuário, gera lembretes, relatórios, estimativas e exportações. Não é sistema oficial de companhia aérea, autoridade aeronáutica, sindicato, empregador, prestador de saúde, seguradora, serviço de emergência, escritório jurídico, instituição financeira ou órgão público.

2. CONFERÊNCIA OBRIGATÓRIA E FONTES OFICIAIS

A escala oficial, comunicações do empregador, manuais, ACT, CCT, RBAC, legislação e orientações das autoridades competentes prevalecem sobre qualquer informação exibida pelo CrewCheck. Horários, portões, meteorologia, trânsito, transporte, rede credenciada, valores, regulamentação e cálculos financeiros devem ser confirmados antes de decisões profissionais ou pessoais. Alertas e previsões são auxiliares e podem conter atrasos, indisponibilidades, falhas de origem ou interpretação incompleta.

3. CADASTRO, SEGURANÇA E CONDUTA

O usuário deve fornecer informações verdadeiras, proteger sua senha e impedir acesso não autorizado. Credenciais corporativas, senhas, códigos de autenticação multifator e dados de terceiros não devem ser inseridos em campos não destinados a essas informações. O usuário deve possuir autorização para tratar os arquivos e dados enviados. É proibido usar o serviço para fraude, invasão, assédio, violação de direitos, conteúdo ilegal, abuso de recursos ou tentativa de contornar controles de segurança.

4. IMPORTAÇÃO E TRATAMENTO DA ESCALA

A escala pode ser processada para extrair nome, matrícula quando presente, base, função, datas, voos, reservas, sobreavisos, treinamentos, folgas, repousos, pernoites e observações. A qualidade do resultado depende do formato e da integridade do arquivo. O usuário deve revisar a importação e manter cópia do documento oficial. O CrewCheck não garante correspondência absoluta com arquivos protegidos, ilegíveis, alterados ou incompatíveis.

5. GOOGLE CALENDAR E MENOR PRIVILÉGIO

A integração com Google Calendar é opcional e somente começa quando o usuário escolhe conectar ou sincronizar. O CrewCheck solicita exclusivamente o escopo https://www.googleapis.com/auth/calendar.events.owned para criar, consultar, atualizar e excluir eventos nos calendários Google pertencentes ao próprio usuário.

O CrewCheck usa o calendário principal. A consulta é limitada ao período necessário da escala. A remoção ou substituição alcança somente eventos identificados por propriedades privadas CrewCheck ou pela marca #CREWCHECK. Eventos pessoais sem essa identificação não devem ser alterados. Uma permissão somente de leitura não permitiria a sincronização solicitada pelo usuário. O CrewCheck não solicita acesso a Gmail, Drive, Contatos, Fotos ou senha da Conta Google.

A autorização pode ser revogada no CrewCheck ou nas conexões da Conta Google. A revogação impede novas operações, mas não apaga automaticamente eventos já criados. Esses eventos permanecem sob controle do usuário até serem removidos no Google Calendar ou por uma limpeza realizada antes da desconexão.

6. GOOGLE API SERVICES USER DATA POLICY E LIMITED USE

O uso de informações recebidas das APIs do Google seguirá a Google API Services User Data Policy, inclusive os requisitos de Limited Use. Dados brutos, derivados, agregados ou anonimizados do Google Workspace não serão vendidos, usados para publicidade direcionada, avaliação de crédito, corretagem de dados ou finalidade incompatível com a sincronização escolhida pelo usuário.

Dados do Google Workspace não serão utilizados para desenvolver, melhorar ou treinar modelos gerais de inteligência artificial ou aprendizado de máquina e não serão transferidos a terceiros para treinamento de modelos próprios. O acesso humano é proibido, salvo solicitação afirmativa do usuário para suporte sobre dados específicos, investigação de segurança, obrigação legal ou tratamento agregado permitido pelas políticas aplicáveis.

7. DADOS PESSOAIS TRATADOS

Podem ser tratados dados de cadastro e segurança, dados presentes na escala, preferências, histórico, relatórios, mensagens, plano de assinatura e identificadores técnicos. Localização somente é tratada quando autorizada ou enviada voluntariamente para recursos como Saída Inteligente, emergência ou busca de locais próximos. O CrewCheck não armazena número completo de cartão nem senha da Conta Google.

Na integração Google Calendar podem ser processados identificador do calendário, identificador do evento, título, descrição, local, data, hora, lembretes, cor e propriedades privadas técnicas, exclusivamente para criar, localizar, atualizar, deduplicar ou excluir eventos CrewCheck.

8. FINALIDADES E BASES LEGAIS

Os dados são usados para autenticação, execução das funcionalidades solicitadas, leitura e organização da escala, sincronização, alertas, relatórios, suporte, segurança, prevenção a fraude e cumprimento de obrigações legais. As bases legais podem incluir execução de contrato, consentimento ou autorização específica, legítimo interesse com avaliação de necessidade, cumprimento de obrigação legal, exercício regular de direitos e proteção da vida quando aplicável.

Permissões opcionais, como localização, notificações, compartilhamentos e Google Calendar, podem ser recusadas ou revogadas sem impedir funcionalidades independentes dessas permissões.

9. COMPARTILHAMENTO E FORNECEDORES

O CrewCheck não vende dados pessoais e não compartilha dados com anunciantes. Fornecedores de hospedagem, banco de dados, e-mail, mensageria, voz, mapas, meteorologia, pagamentos e Google podem receber somente os dados necessários à execução do recurso. O compartilhamento também pode ocorrer por obrigação legal, segurança, prevenção a fraude ou ação expressa do usuário. Links, visitantes e compartilhamentos com colegas dependem de permissões e podem ser revogados.

10. TRANSFERÊNCIA INTERNACIONAL E SEGURANÇA

Alguns fornecedores podem operar fora do Brasil. O tratamento deve ser limitado à finalidade contratada e observar mecanismos compatíveis com a LGPD. O CrewCheck adota HTTPS, autenticação, controles de acesso, segregação lógica, hash de senhas e registros de auditoria, validação de entradas, tokens aleatórios, expiração e revogação. Campos sensíveis específicos podem usar criptografia autenticada. Nenhum sistema é totalmente imune a incidentes; medidas de contenção, investigação e comunicação serão adotadas conforme a legislação.

11. RETENÇÃO, EXCLUSÃO E DIREITOS DO TITULAR

Dados são mantidos enquanto necessários para fornecer o serviço, preservar segurança, cumprir obrigações legais ou exercer direitos. Tokens do Google possuem validade limitada e são armazenados no dispositivo. A desconexão remove o token local e solicita revogação quando suportado.

O titular pode solicitar confirmação, acesso, correção, portabilidade, informação sobre compartilhamentos, anonimização, bloqueio, eliminação, revogação de consentimento e revisão de decisões automatizadas quando aplicável. A exclusão da conta remove dados associados no banco, ressalvados registros mínimos que devam ser mantidos por obrigação legal, prevenção a fraude, cobrança ou exercício regular de direitos. O cancelamento da assinatura é procedimento separado.

12. PLANOS, COBRANÇA E DIREITOS DO CONSUMIDOR

Preço, periodicidade, data de cobrança, promoção, teste e renovação automática devem ser apresentados antes da contratação. Assinaturas Google Play são administradas na Play Store; assinaturas web seguem o canal informado na compra. O cancelamento interrompe renovações futuras e não exclui automaticamente a conta. Direitos obrigatórios previstos no Código de Defesa do Consumidor e demais normas aplicáveis não são afastados.

13. PROPRIEDADE INTELECTUAL

Marca, interface, código, textos, identidade visual e documentação do CrewCheck são protegidos. O usuário recebe licença pessoal, limitada, revogável, não exclusiva e intransferível. É proibido copiar, revender, sublicenciar, explorar comercialmente, remover avisos de propriedade ou sugerir vínculo oficial com companhia aérea ou autoridade pública sem autorização.

14. DISPONIBILIDADE, ATUALIZAÇÕES E RESPONSABILIDADE

O serviço pode receber atualizações ou ter recursos alterados, suspensos ou descontinuados por razões técnicas, legais, econômicas, de segurança ou mudança de fornecedor. Não há garantia de disponibilidade contínua, ausência absoluta de erros ou compatibilidade permanente com todos os dispositivos e formatos.

Nada nestes Termos exclui responsabilidade que não possa ser afastada por lei. Nos limites permitidos, o CrewCheck não responde por decisões tomadas sem conferência oficial, informação de terceiros, falha de conectividade, indisponibilidade externa, uso indevido da conta ou arquivo fornecido pelo usuário. O usuário deve manter cópias dos documentos oficiais e comunicar falhas relevantes.

15. SUSPENSÃO E ENCERRAMENTO

A conta pode ser limitada ou suspensa em caso de fraude, risco de segurança, uso ilegal, violação material, abuso ou exigência legal. Quando compatível com segurança e legislação, o usuário será informado e poderá apresentar esclarecimentos. O usuário pode deixar de usar o serviço e solicitar exclusão da conta.

16. LEI APLICÁVEL E CONTATO

Aplicam-se as leis da República Federativa do Brasil, especialmente a Lei Geral de Proteção de Dados Pessoais, o Marco Civil da Internet, o Código Civil e, quando houver relação de consumo, o Código de Defesa do Consumidor. As partes buscarão solução amigável. Em relação de consumo, permanece preservado o foro do domicílio do consumidor e o acesso à Justiça assegurado por lei.

Contato geral, privacidade e exercício de direitos: suporte@crewcheck.app.

Ao aceitar, o usuário confirma que leu, compreendeu e concorda com esta versão dos Termos de Uso e da Política de Privacidade.';

SET @crewcheck_terms_hash = SHA2(@crewcheck_terms_body, 256);
SET @crewcheck_terms_version = (SELECT COALESCE(MAX(version), 0) + 1 FROM crewcheck_platform_terms);
SET @crewcheck_terms_id = CONCAT('terms-', @crewcheck_terms_version, '-oauth-legal');

UPDATE crewcheck_platform_terms
SET status = 'superseded'
WHERE status = 'published'
  AND content_hash <> @crewcheck_terms_hash;

INSERT INTO crewcheck_platform_terms(
  id, version, title, body_text, content_hash, status,
  published_at, effective_at, created_by
)
SELECT
  @crewcheck_terms_id, @crewcheck_terms_version, @crewcheck_terms_title,
  @crewcheck_terms_body, @crewcheck_terms_hash, 'published',
  NOW(3), NOW(3), 'system-v14.0.2'
WHERE NOT EXISTS (
  SELECT 1 FROM crewcheck_platform_terms WHERE content_hash = @crewcheck_terms_hash
);

UPDATE crewcheck_platform_terms
SET status = 'published', published_at = COALESCE(published_at, NOW(3)), effective_at = COALESCE(effective_at, NOW(3))
WHERE content_hash = @crewcheck_terms_hash;

INSERT INTO crewcheck_schema_migrations(version, description)
VALUES('20260719_009', 'CrewCheck v14.0.2 Google OAuth least privilege and comprehensive UTF-8 legal terms')
ON DUPLICATE KEY UPDATE description = VALUES(description);
