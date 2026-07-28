# CrewCheck — roteiro de auditoria funcional

Este roteiro complementa a auditoria estrutural automática. Ele não autoriza novas funcionalidades: cada item existente deve funcionar, ser corrigido ou ser retirado temporariamente da navegação.

## Estratégia aprovada

A auditoria passa a ser executada em três fases independentes:

1. **Web/Render e PWA:** fonte de verdade, FlyDeck, navegação, Saída Inteligente, Concierge, Radar, Meteorologia, financeiro, conta e integrações;
2. **Responsividade:** navegador mobile, iPad/tablet e desktop, ainda usando o cliente Web/PWA;
3. **Android nativo:** APK/AAB assinados, launcher/adaptive icon, compartilhamento de PDF, notificações em segundo plano e publicação na Play Store.

A terceira fase fica adiada até o sistema Web/PWA estar funcionalmente estável. A ausência de APK/AAB não bloqueia a correção das funções Web, mas nenhuma função será considerada concluída para Android sem teste posterior no aplicativo assinado.

## Regra de evidência

Para cada teste, registrar:

- versão exibida pelo cliente;
- ambiente: navegador, PWA, tablet ou aplicativo assinado;
- escala oficial utilizada e competência;
- tela e ação executada;
- resultado esperado;
- resultado observado;
- captura de tela ou vídeo quando houver falha visual;
- primeira mensagem de erro relevante;
- impacto: bloqueador, alto, médio ou visual;
- decisão: aprovado, corrigir ou ocultar temporariamente.

Não anexar credenciais, CPF, telefone, token, localização precisa, conteúdo médico ou dados completos da tripulação.

## Ordem obrigatória — fase Web/PWA

### 1. Fonte de verdade

1. Importar o CrewRosterReport oficial normal.
2. Importar o CrewRosterReport rotacionado.
3. Compartilhar ou selecionar o PDF no PWA quando a plataforma permitir.
4. Conferir competência, base, função, voos, folgas, HSB/ASB, reserva, MCK e demais atividades.
5. Comparar FlyDeck, Escala completa, Histórico, Saída Inteligente, Radar e Concierge.
6. Confirmar que todos apontam para a mesma próxima programação.
7. Confirmar múltiplas programações no mesmo dia e virada de meia-noite.
8. Confirmar que aviso de divergência não apaga nem substitui meses anteriores.

**Bloqueio:** qualquer voo oficial ausente, origem/destino trocados, data deslocada ou escala parcial apresentada como completa.

### 2. FlyDeck e navegação

1. Abrir cada uma das cinco etapas cronológicas.
2. Conferir que o botão retorna ao FlyDeck.
3. Abrir todos os grupos do Menu.
4. Confirmar que não existe rota duplicada ou tela órfã.
5. Validar o rodapé no navegador mobile, iPad e desktop.
6. Validar scroll do menu e ausência de sobreposição.
7. Confirmar que uma função quebrada não permanece destacada como pronta.

### 3. Saída Inteligente

Testar voo, reserva, sobreaviso, treinamento presencial e programação fora de base. Testar também folga, repouso, EAD e pernoite, que não devem gerar saída.

Para cada programação elegível, conferir:

- evento selecionado;
- apresentação publicada;
- origem usada;
- aeroporto/local de apresentação;
- modalidade;
- tempo de rota;
- margem;
- horário final de saída;
- posicionamento no mesmo dia ou no dia anterior;
- atualização após mudança de trânsito/localização;
- ausência de alerta duplicado.

### 4. Concierge CrewCheck

Executar por texto e, quando permitido, por áudio:

- “O que tenho hoje?”
- “O que tenho amanhã?”
- “O que tenho dia 15?”
- “Que horas me apresento?”
- “Quando volto para a base?”
- “Qual o portão do LA3730?”
- “Qual o portão do G3 1234?”
- “E o status?”
- “Depois desse voo?”
- “Como está o METAR em SBGR?”
- “Onde vou dormir?”
- “Tem farmácia perto de mim?”
- “Que horas devo sair?”
- “Tenho alguma irregularidade?”

Depois, aguardar ou simular contexto vencido e confirmar que voo, data ou programação antigos não são reutilizados.

**Bloqueio:** inventar voo, horário, aeroporto, portão, hotel, regra ou localização.

### 5. Operacional, financeiro e apoio

Auditar Radar, Meteorologia, Despertador, Regulamentação, Carga, Diárias, Salário, Hotéis, Calendário, Exportação, Guardian, Emergência, CrewLock, Crew Locker, Manual, Suporte, Assinaturas e Administração.

Cada tela deve ter ação principal funcional, estado vazio legível, erro de serviço compreensível e permissões corretas.

### 6. Conta e integrações

Validar login, cadastro, recuperação de senha, Google OAuth, exclusão de conta, calendário sem duplicidade, exportações e webhook Asaas. Nenhum erro de integração pode apagar escala, preferências ou histórico local.

## Matriz da fase atual

| Ambiente | Largura mínima | Claro | Escuro | Scroll | Menu/voltar | Ação principal |
|---|---:|---|---|---|---|---|
| Navegador mobile | 360 px | ☐ | ☐ | ☐ | ☐ | ☐ |
| Navegador mobile grande | 412 px | ☐ | ☐ | ☐ | ☐ | ☐ |
| iPad mini/tablet | 768 px | ☐ | ☐ | ☐ | ☐ | ☐ |
| Desktop | 1366×768 | ☐ | ☐ | ☐ | ☐ | ☐ |
| Desktop largo | 1920×1080 | ☐ | ☐ | ☐ | ☐ | ☐ |

## Fase Android adiada

Depois da aprovação Web/PWA, executar uma rodada separada para:

- APK release assinado;
- AAB Play Console assinado;
- atualização automática do cliente;
- recebimento de PDF por compartilhamento;
- notificações em segundo plano;
- deep links;
- permissões;
- ícone launcher e adaptive icon;
- instalação, atualização e rollback seguro.

## Critério de encerramento

Uma superfície somente é aprovada quando:

- usa a fonte de dados correta;
- não apresenta dado fictício como real;
- funciona em estado normal, vazio e de erro;
- respeita plano e permissão;
- é legível nos dois temas;
- não corta, sobrepõe ou bloqueia navegação;
- possui evidência registrada;
- possui regressão automática quando tecnicamente possível.

O relatório automático `CrewCheck-functional-audit` complementa este roteiro, mas não substitui os testes nos ambientes reais.
