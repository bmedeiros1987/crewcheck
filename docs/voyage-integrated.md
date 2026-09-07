# Voyage integrado ao CrewCheck

## Objetivo

O conceito do **CrewCheck Explorer é preservado** dentro do CrewCheck, mas passa a usar oficialmente a marca **Voyage**. A mudança é de identidade e integração, não de escopo funcional.

Dentro do CrewCheck, o Voyage funciona como uma **camada de exploração contextual para o tripulante**: usa a escala para reconhecer onde e quando existe tempo livre e então ajuda a descobrir gastronomia, passeios, experiências e oportunidades próximas. Ele não deve replicar nem competir com funcionalidades nativas do CrewCheck.

O **app Voyage standalone** é outro produto: um Travel Operating System completo para viagens pessoais, de lazer, negócios e bleisure, com planejamento de ponta a ponta.

## Fronteira de produto

### CrewCheck continua responsável por

- escala, jornadas, voos operacionais, reserva e sobreaviso;
- apresentação e Saída Inteligente;
- Radar, portão, status operacional e meteorologia operacional;
- regulamentação, limites e conformidade;
- pernoite operacional e contexto de hotel da escala;
- despertador e rotinas diretamente ligadas à operação;
- diárias, salário e demais ferramentas de tripulante;
- qualquer decisão operacional ou de segurança.

### Voyage dentro do CrewCheck — modo Explorer

- descobrir o que fazer em uma folga ou janela realmente livre;
- encontrar gastronomia, cafés, lazer, experiências e pontos de interesse próximos;
- explorar o entorno de um pernoite sem substituir o módulo operacional de hotel;
- sugerir oportunidades contextualizadas por localização e tempo disponível;
- usar a escala somente como restrição e contexto, nunca como roteiro pessoal automático.

O modo integrado deve sempre preferir **deep links** para módulos nativos do CrewCheck quando o assunto for operacional, em vez de criar uma versão concorrente da mesma função.

### App Voyage standalone

O aplicativo Voyage completo pode oferecer planejamento pessoal do início ao fim, incluindo roteiro cronológico, reservas, hospedagem pessoal, transporte, orçamento, refeições, atividades, conexões, clima de viagem, bagagem, colaboração e demais inteligências próprias do produto.

Esses recursos completos não devem ser duplicados dentro do CrewCheck apenas porque compartilham serviços de backend.

## Responsabilidades e fontes de verdade

- **CrewCheck** é a fonte de verdade para escala e vida operacional do tripulante.
- **Voyage standalone** é a fonte de verdade para viagens pessoais do usuário.
- **Voyage dentro do CrewCheck** é uma projeção contextual do conceito Explorer, e não uma segunda implementação do CrewCheck nem o app Voyage completo embutido.
- Um voo da escala não se transforma automaticamente em trecho da viagem pessoal.
- A escala serve como restrição de disponibilidade para evitar sugestões incompatíveis com trabalho e repouso.

## Consentimento e minimização

O compartilhamento da escala só ocorre após ação explícita do usuário na superfície Voyage do CrewCheck.

A ponte envia apenas contexto minimizado necessário à exploração:

- base aeroportuária, quando conhecida;
- fuso e locale;
- período da escala;
- datas de folga explicitamente publicadas;
- âncoras operacionais de trabalho com horários e aeroportos quando disponíveis.

Não são enviados pela ponte:

- senha ou segredo de autenticação do usuário;
- chaves/tokens de provedores;
- CPF;
- credenciais de pagamento;
- PNR/localizador;
- nomes de outros tripulantes;
- e-mail do usuário;
- endereço residencial ou de anfitriões particulares;
- conteúdo irrelevante de e-mail ou outras fontes pessoais.

Dias desconhecidos ou que possam representar repouso não são presumidos livres.

## Rotas

CrewCheck:

- `GET /api/voyage/integration/status`
- `POST /api/voyage/integration/preview`

Voyage:

- `GET /api/v1/integrations/crewcheck/capabilities`
- `POST /api/v1/integrations/crewcheck/preview`

A comunicação backend-to-backend usa `CREWCHECK_SHARED_SERVICES_TOKEN` e não expõe o token ao browser.

## Política de alteração do roteiro

A integração não altera roteiro automaticamente.

Fluxo obrigatório no Voyage standalone:

**detectar → explicar → propor → mostrar diferença → pedir aprovação → aplicar**.

Alertas operacionais que não modificam o itinerário podem ser apresentados automaticamente pelo produto responsável por aquele domínio.

## UI

O menu principal do CrewCheck ganha a superfície **Voyage — Explorer do tripulante · integrado ao CrewCheck**.

A tela deve deixar explícito que:

1. o conceito Explorer continua existindo;
2. dentro do CrewCheck, Voyage significa descoberta contextual, não um segundo app de viagens completo;
3. funções operacionais continuam no CrewCheck e devem ser abertas por deep link quando necessário;
4. o usuário autoriza antes de compartilhar disponibilidade;
5. folgas explícitas, compromissos protegidos e dias incertos são tratados de forma diferente;
6. existe um CTA separado para abrir o **Voyage completo** fora do modo integrado.

A implementação visual está em `client/src/components/voyage/VoyageIntegrated.tsx` e `voyage-integrated.css`.
