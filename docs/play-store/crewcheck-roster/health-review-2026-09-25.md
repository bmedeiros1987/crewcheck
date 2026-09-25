# CrewCheck Roster — correção da declaração de saúde

Data: 25/09/2026. Pacote: `com.crewcheck.app`.

## Estado e limite desta alteração

Esta alteração corrige os arquivos da política e prepara o bloco de descrição da loja. **Não comprova que os textos foram publicados, que o Console foi atualizado ou que houve reenvio.** Confirmar esses passos separadamente, com evidência do SHA e do versionCode. O acesso automatizado ao Console não foi iniciado nesta revisão por indisponibilidade do navegador conectado.

Referência de código auditada: `5cd8280d006450d59f095ec4b608f2d76cbd2430`.

- `scripts/android-play/release-policy.json`: mobile com targetSdk 36.
- `android-wrapper/store-policy.gradle`: aplica o targetSdk e exclui a implementação e o SDK Health Connect da variante principal da Play.
- `android-wrapper/lifecompanion/src/main/java/com/crewcheck/life/SamsungHealthRuntime.java`: Companion separado; Samsung Health Data SDK; passos, atividade, distância, calorias de atividade, sono e escores de sono/energia. Não presumir frequência cardíaca em repouso nessa fonte.
- `client/src/pages/LegalPage.tsx` e `client/public/privacy.html`: divulgações alinhadas de CrewLife.

Verificar o manifesto do AAB final é obrigatório: a configuração-fonte não prova, sozinha, o conteúdo do artefato enviado.

## Declaração Apps de saúde

CrewLife se enquadra em bem-estar/fitness pessoal pelas funções de atividade física e sono efetivamente implementadas. Para essas funções, declarar **Atividade e condicionamento físicos (Activity and fitness)** e **Controle do sono (Sleep management)**, conforme os rótulos apresentados pelo Console. Não declarar função médica, diagnóstico, dispositivo médico, aptidão profissional ou decisão operacional para o CrewLife. Não marcar que o app não tem funcionalidades de saúde só porque a variante principal não usa Health Connect.

A declaração é do aplicativo inteiro, não apenas do CrewLife: antes de remover qualquer outra categoria, verificar os demais recursos realmente distribuídos, inclusive Guardian/Concierge e eventual conteúdo de saúde. Não remover categorias necessárias para funções existentes nem declarar funcionalidades futuras/experimentais ainda ausentes do artefato.

### Outros recursos com dados de saúde no app inteiro (verificados no código)

Além do CrewLife, o artefato distribuído contém recursos que tratam informações médicas informadas pelo usuário. Eles precisam ser considerados na declaração e no formulário de Segurança dos dados; não declarar o app como restrito a fitness/sono:

- **Central de Emergência** (`client/src/components/v1391/EmergencyCenterView.tsx`, `server/v1391/emergency.mjs`): perfil médico de emergência com tipo sanguíneo, alergias, medicação contínua, observações médicas e operadora/código do plano de saúde, armazenado **no servidor** com AES-256-GCM. Alertas via Telegram para contatos salvos, conexões e colegas do mesmo hotel (padrão: contatos e colegas ligados, localização incluída). Dados médicos só entram em alerta médico com inclusão ativada **e** autorização explícita; inclusão desligada por padrão.
- **Guardian** (`server/v14316/controlCenter.mjs`): cartão de emergência por QR/link com dados médicos e contato de emergência, criptografado, validade 72 h por padrão (máx. 30 dias), revogável, legível por quem tiver o link.
- **Busca na rede do plano de saúde (Amil)**: envia localização, cidade, estado e termo de busca ao servidor.

Escolher no Console a categoria que corresponda a essas funções (informações médicas de emergência informadas pelo usuário), usando os rótulos que o formulário apresentar; não inventar rótulos neste documento. Não se trata de diagnóstico, tratamento ou dispositivo médico.

**Exclusão de conta:** até esta PR, `handleAccountDeletion` não apagava perfil médico, preferências, sessões e alertas de emergência nem cartões Guardian. A PR passa a removê-los na mesma transação (`accountHealthDeletionStatements`, testado em `scripts/regression-account-health-deletion.mjs`). Só responder "o usuário pode solicitar exclusão" para esses dados depois que esta correção estiver em produção. Outras tabelas de preferências fora do escopo de saúde (por exemplo `crewcheck_platform_routine_preferences` e `crewcheck_platform_addresses`) também não são alcançadas pela exclusão atual; tratar em correção própria antes de responder ao formulário sobre exclusão para esses tipos de dado.

## Health Connect: destino das cinco permissões

Para a variante principal atual sem Health Connect, remover as solicitações e justificativas antigas destas cinco permissões; **não substituir por justificativas fictícias para manter acesso não utilizado**:

| Permissão | Ação na solicitação do Roster | Esclarecimento |
| --- | --- | --- |
| `READ_DISTANCE` | REMOVER | A distância de atividade opcional vem do Companion/Samsung; não confundir com distância de voo. |
| `READ_EXERCISE` | REMOVER | O acompanhamento manual e o resumo de atividade Samsung não exigem esta permissão do Health Connect no app principal. |
| `READ_STEPS` | REMOVER | Passos manuais ou recebidos do Companion não justificam leitura direta pelo Health Connect. |
| `READ_SLEEP` | REMOVER | Horas de sono manuais ou resumos Samsung não justificam leitura direta pelo Health Connect. |
| `READ_RESTING_HEART_RATE` | REMOVER | A variante principal não solicita esta leitura; a fonte Samsung auditada não fornece esse campo. |

Não transferir automaticamente essas declarações para `com.crewcheck.life`: o Companion utiliza outro SDK e tem declaração, ficha e política próprias. Separar os pacotes não dispensa cumprir as políticas de saúde e dados de cada aplicativo.

Se o Console continuar exigindo a declaração, identificar os versionCodes que ainda contêm permissões de saúde, inclusive versões retidas, Wear e canais de teste do mesmo pacote. Um AAB limpo em teste interno não substitui automaticamente um AAB antigo em outra faixa ou em uma submissão rejeitada. Não alterar produção, encerrar faixas ou descartar mudanças não relacionadas sem verificar a autorização e o impacto.

## Descrição pública e política

O arquivo `pt-BR/crewlife-description.txt` é um **bloco para incluir/substituir na descrição completa**, não uma ficha completa nem prova de publicação. Preservar as informações verdadeiras dos outros recursos. Conferir o limite total da ficha e todas as traduções ativas. Não anunciar compatibilidade universal com relógios, aprovação da Samsung/Google ou sincronização que não possa ser demonstrada.

Publicar as duas políticas atualizadas (`/privacy` e `/privacy.html`) e abrir a URL efetivamente cadastrada na Play sem autenticação. Os oito parágrafos do CrewLife devem coincidir nas duas superfícies; o teste dedicado verifica essa igualdade. Preservar contato, retenção, consentimento, exclusão, finalidade e divulgação do espelhamento opcional no relógio.

O aviso deve informar que CrewLife/Companion não são dispositivos médicos, não diagnosticam, tratam, curam ou previnem condições médicas e orientar a consulta a profissional de saúde qualificado. A declaração não deve prometer aprovação nem esconder funcionalidades médicas que existam em outra parte do aplicativo.

## Segurança dos dados

Revisar os fluxos reais de todo o app e SDKs antes de responder ao formulário. Fluxos verificados no código, além do CrewLife: informações de saúde do perfil de emergência e do Guardian (coletadas e armazenadas no servidor, criptografadas; compartilhadas por ação do usuário com os destinatários que ele configura via Telegram ou com quem tiver o link do Guardian); localização (Saída Inteligente, emergência, busca de locais, rede do plano) repassada às APIs do Google Maps/Places pelo servidor e incluída em alertas; mensagens de chat com visitantes/colegas; e dados de assinatura (Google Play e processador de pagamentos). Ausência de Health Connect não significa ausência de tratamento de dados de saúde. Distinguir processamento no aparelho, comunicação local com o Companion e transferência opcional de resumos para Wear OS. Não afirmar que dados nunca saem do aparelho quando o espelhamento está ativo. Não declarar coleta/compartilhamento como ausentes sem verificar as definições e exceções do formulário, transporte da plataforma, logs, analytics e eventuais backups.

Revogar a autorização do Companion no Samsung Health é diferente de apagar resumos no CrewCheck. Validar esses controles com o aparelho de teste, sem apagar a escala, a conta principal ou dados de produção.

## Gate antes de Enviar para análise

- [ ] CI relevante verde no SHA exato; nenhuma alteração inesperada de parser/APZ/journey/compliance/finance, secrets ou permissões administrativas.
- [ ] AAB a reenviar identificado por SHA/versionCode e manifesto final: targetSdk 36 ou superior e nenhuma permissão `android.permission.health.*` no principal; verificar também permissões adicionadas por dependências e os demais módulos do AAB.
- [ ] Verificar versões retidas e canais do mesmo pacote; não confundir teste interno com o artefato rejeitado.
- [ ] Política cadastrada acessível sem login e com o conteúdo desta revisão em ambas as URLs.
- [ ] Descrição pública, traduções, Apps de saúde, Health Connect e Segurança dos dados coerentes com o comportamento real.
- [ ] Evidência de acesso do revisor ao CrewLife manual e, quando anunciado, demonstração da integração Samsung compatível/autorizada.
- [ ] Visão geral da publicação revisada: nenhuma mudança alheia agregada; nenhum novo erro ou inconsistência.
- [ ] Só então enviar novamente para análise. Registrar confirmação do Console; envio não é aprovação. Não promover canal de teste a produção nem publicar outros aplicativos por implicação.

## Fontes oficiais

- https://support.google.com/googleplay/android-developer/answer/14738291 — declaração de Apps de saúde.
- https://support.google.com/googleplay/android-developer/answer/16679511 — saúde, transparência e aviso sobre dispositivo médico.
- https://support.google.com/googleplay/android-developer/answer/16909972 — permissões e APIs de informações sensíveis.
- https://support.google.com/googleplay/android-developer/answer/11926878 — desde 31/08/2026, novas versões mobile devem ter target API 36 ou superior.
- https://developer.android.com/health-and-fitness/health-connect/publish — publicação de integrações Health Connect.
- https://support.google.com/googleplay/android-developer/answer/10787469 — formulário Segurança dos dados.
