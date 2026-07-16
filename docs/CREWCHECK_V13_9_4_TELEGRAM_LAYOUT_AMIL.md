# CrewCheck v13.9.4 — Telegram, layouts, endereço e rede S450/S750

## Incidente do token do Telegram

O token publicado em conversa deve ser considerado comprometido. Revogue-o no `@BotFather` com `/revoke`, gere outro e salve o novo valor apenas no Render. Nenhum token é necessário no cliente, no GitHub ou na URL do webhook.

O endereço correto do webhook é:

```text
https://crewcheck.online/api/telegram/webhook
```

A raiz `https://crewcheck.online/` não recebe atualizações do bot.

Depois do deploy, abra **Concierge Telegram → Revincular webhook e menu**. O painel compara o endereço esperado com `getWebhookInfo`, mostra fila e último erro sem revelar credenciais. Também é possível conferir:

```text
GET https://crewcheck.online/api/telegram/diagnostic
```

## Variáveis do Render

Obrigatórias para Telegram:

- `TELEGRAM_BOT_TOKEN`: token novo gerado após a revogação.
- `TELEGRAM_BOT_USERNAME`: nome do bot sem `@`.
- `TELEGRAM_WEBHOOK_SECRET`: segredo aleatório privado usado no cabeçalho entregue pelo Telegram.
- `TELEGRAM_PUBLIC_BASE_URL=https://crewcheck.online`.

Para transformar GPS em endereço próximo e manter rotas:

- `GOOGLE_MAPS_SERVER_KEY`: chave restrita ao servidor com Geocoding API e Routes API habilitadas.

Variáveis já existentes de voz, meteorologia, banco e alertas continuam válidas. A base publicada S450/S750 é embarcada no servidor e não precisa de credencial Amil. Se uma API oficial contratada for configurada, ela continua prioritária por meio de `CREWCHECK_AMIL_ENABLED`, `AMIL_API_BASE_URL`, `AMIL_API_SEARCH_PATH` e `AMIL_API_ACCESS_TOKEN` ou `AMIL_API_KEY`.

## Rede credenciada importada

- 30 PDFs públicos foram baixados e validados visualmente.
- O snapshot guarda URL, data de impressão, número de páginas e SHA-256 de cada documento.
- Foram importados apenas registros que apresentam cobertura nas colunas S450 ou S750.
- A fonte não publica um PDF para Amazonas. Essa lacuna aparece nos metadados em vez de ser preenchida por suposição.
- O link rotulado como laboratórios do Rio Grande do Sul contém uma tabela hospitalar; o importador classifica pelo conteúdo.
- Pronto atendimento adulto exclui unidades identificadas como exclusivamente infantis. Obstetrícia e pediatria permanecem filtros separados.
- Os PDFs não fornecem endereço ou horário. O botão **Localizar** pesquisa o nome/cidade no Maps; a interface não inventa endereço nem afirma atendimento 24 horas.

O snapshot é informativo. Rede, elegibilidade, especialidade, horário e autorização devem ser confirmados nos canais oficiais da Amil antes do atendimento.

## Proteções de layout

- Menu móvel usa abas entre navegação e ações rápidas, rolagem única e altura segura do dispositivo.
- Menu desktop usa painel central amplo, navegação em duas colunas e ações em coluna própria.
- A escala utiliza classes isoladas da folha legada; data, título, apresentação, horários e detalhes não disputam a mesma grade.
- Voos tripulando permanecem verdes, deslocamentos/extra cinza e pernoites roxos.
- A Saída Inteligente mantém coordenadas somente para cálculo da rota e mostra ao usuário o endereço próximo retornado pelo servidor.

## Verificação

```bash
npm run check
npm run build
npm run regression:v13.9.3:redemet-weather
npm run regression:v13.9.4:telegram-layout-amil
```
