# Voyage integrado ao CrewCheck

## Objetivo

O Voyage passa a substituir o conceito de **CrewCheck Explorer** como a superfície de viagem pessoal do ecossistema. CrewCheck e Voyage continuam produtos distintos, mas o usuário pode autorizar uma ponte direta entre a escala operacional e o planejamento pessoal.

## Responsabilidades

- **CrewCheck** continua sendo a fonte de verdade da escala, jornadas, voos operacionais, reserva, sobreaviso e demais compromissos de tripulante.
- **Voyage** continua sendo a fonte de verdade do roteiro pessoal, hospedagem pessoal, orçamento, atividades, refeições e deslocamentos da viagem.
- Um voo da escala não se transforma automaticamente em trecho da viagem pessoal.
- A escala serve como restrição de disponibilidade para evitar que o Voyage planeje atividades em horários incompatíveis.

## Consentimento e minimização

O compartilhamento da escala só ocorre após ação explícita do usuário na superfície **Voyage integrado** do CrewCheck.

A ponte envia apenas contexto minimizado necessário ao planejamento:

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

## Variáveis de ambiente

No serviço CrewCheck:

- `VOYAGE_API_URL` — URL base da API do Voyage. Pode usar `VOYAGE_INTERNAL_API_URL` como alias quando houver endpoint interno apropriado.
- `VOYAGE_PUBLIC_URL` — URL que o usuário abre para entrar no Voyage. Enquanto o domínio definitivo não estiver publicado, pode apontar para a URL atual do app.
- `CREWCHECK_SHARED_SERVICES_TOKEN` — segredo compartilhado server-to-server.

No serviço Voyage:

- `CREWCHECK_SHARED_SERVICES_TOKEN` — deve ter o mesmo valor do CrewCheck.
- `CREWCHECK_SHARED_API_BASE_URL` — base dos serviços compartilhados do CrewCheck quando usados pelo Voyage.

Os valores reais ficam somente no Render/gerenciador de segredos e nunca no GitHub.

## Política de alteração do roteiro

A integração não altera roteiro automaticamente.

Fluxo obrigatório no Voyage:

**detectar → explicar → propor → mostrar diferença → pedir aprovação → aplicar**.

Alertas operacionais que não modificam o itinerário (por exemplo, hora de sair, mudança de portão, esteira de bagagem ou risco de conexão) podem ser apresentados automaticamente.

## UI

O menu principal do CrewCheck ganha a superfície **Voyage — Beyond the trip · integrado ao CrewCheck**.

A tela:

1. explica a separação entre os produtos;
2. pede autorização antes de compartilhar a disponibilidade;
3. mostra folgas explícitas, compromissos protegidos e dias que não serão presumidos livres;
4. oferece entrada direta no Voyage;
5. mantém o CrewCheck disponível para a operação do tripulante.

A implementação visual está em `client/src/components/voyage/VoyageIntegrated.tsx` e `voyage-integrated.css`.
