# Classificação mínima e composição read-only, OFF

## Base e ownership

Branch empilhada na #1203 `693df833220370d1bd3aa7fb6a8aab7c0bc369a6`, com merge normal da #1207 corrigida `851c4e922fdb63464ac48f8abc6111ed7bf6597b`; main observado `71f18784`. O merge de dependências é `432b9b970bf11956b669295f8de79d122fcfef84`. A PR aponta para a branch da #1203 e inclui explicitamente os quatro arquivos já revisados da dependência #1207. Nenhum arquivo dessas dependências ou da #1135 é modificado por este incremento. Retarget para main somente depois da integração/revisão das dependências.

Antes da edição: #1135 continua aberta no HEAD `373b2bb2`, base `965a48c4`, autor público bmedeiros1987 e comentários vazios; não foi demonstrado outro owner pessoal nem transferência. A alteração do hunk de seu roteador é uma fronteira ativa, não autorização implícita de edição. Nenhum AGENTS.md/skill local foi encontrado. A primeira tentativa de merge da dependência no novo checkout falhou em stash, sem MERGE_HEAD ou mudança de HEAD; a composição ficou pausada durante a correção P2 da #1207. Depois de conferir checkout limpo, o merge normal do HEAD corrigido terminou.

## Entrega concreta

`conversation-classifier.mjs` reutiliza o reconhecedor da #1203 para frases/typos já previstos, APZ ambígua e followups. Somente texto não reconhecido e dentro do escopo pode alcançar um transporte explicitamente injetado. Default OFF; sem env, fetch ambiente, credencial ou callsite. Modelo/schema do request são compatíveis com a capability #1207, mas nenhum modelo real foi chamado.

A saída de modelo aceita **somente** JSON `{intent:...}` com um dos quatro valores `nextDuty.read`, `schedule.read`, `clarify`, `unsupported`. Campos de argumentos, fatos, confiança ou prosa são rejeitados. O resultado interno acrescenta apenas metadata fixa de modo/followup; texto da resposta não vem do modelo. Uma chamada, prazo máximo de 1s, orçamento de entrada/saída reaproveitado do provider; sem retry. Quota, timeout, erro ou schema inválido caem no caminho determinístico/unsupported. O caminho lexical conhecido funciona sem provider.

Texto remoto limita-se a 160 bytes e orçamento total fixo. Contexto enviado é somente booleano de followup; não há conta, sessão, token, revisão, hash, snapshot, fatos, horários, valores, PDF ou histórico. Tópicos fora da allowlist, instruções conhecidas de prompt injection, números e marcadores de email não são enviados. Isto **não é anonimização completa de texto arbitrário** nem autorização de transmissão real. Neste incremento, todos os inputs e respostas externas são fixtures sintéticas.

`conversation-read-host.mjs` compõe admissão autenticada **injetada** e leitor existente. Default OFF retorna `{handled:false}` sem tocar em admission/read/model. Quando explicitamente ON, exige owner/session/epoch/turn/revision/hash/expiry fornecidos pelo código confiável de admissão e callbacks assíncrono/síncrono de validade; nunca aceita identidade do corpo/texto como prova. Revalida depois dos awaits, antes de transmitir ao classificador e antes de retornar fatos. Source freshness e seleção são decididas pelo leitor canônico, não pelo modelo. Antes de inferência, faz probes locais das duas seleções possíveis e compara a seleção efetivamente entregue depois dela; não implementa outro cálculo ou seleção de jornada.

`createAccountConversationRead` encapsula uma capability canônica existente, recebe snapshot por leitura autorizada, verifica o hash completo e usa identidade da admissão. O teste usa o `createLocalCrewcierge` e `normalizeRosterDays` **reais**, compilados dos arquivos da #1203. Não fabrica chatId/perfil/sender Telegram para o app. Contextos são referências opacas, mantidas pelo owner da sessão; não são JSON serializável para confiar no cliente. A referência delega a validade ao contexto do leitor, sem guardar texto ou criar outro roteador temporal.

Resposta de admissão/turno superado traz `deliveryAllowed:false` e nenhum fato/contexto novo. O consumidor deve descartá-la e ainda manter seu guard final de sessão/turno/sender; o campo não concede autoridade de envio. Mudança da ocorrência com admissão ainda atual produz esclarecimento sem fatos. As capabilities não fazem setAnswer nem enviam mensagem; a regressão de duas perguntas usa um consumidor genérico que descarta o resultado superado e preserva somente a resposta atual.

`composeTemporalFirst` apenas estabelece ordem: chama o handle existente primeiro e preserva seu resultado. Só retorno explicitamente null permite a continuação. OFF/unsupported do novo host devolvem null ao fluxo legado; não chamamos o legado/ask de dentro da capability read-only. Nenhuma admissão, oferta, fila, sender ou sessão Telegram é criada por esse helper.

## Fronteira de wiring: não integrado a uma rota

- Telegram: a #1135 injeta o handle no anchor de `buildTelegramConciergeReply` em `scripts/concierge-temporal-dialogue/apply.mjs:6–8`. O owner deve revisar a composição dentro do `run` já admitido, mantendo `protect/validate/checkNow` e a revalidação final do sender. Intenções já consumidas pelo handle continuam com ele. **Não editamos esse hunk nem absorvemos a base canônica da #1135.**
- App: a admissão concreta precisa vir da sessão canônica do servidor; snapshot e guards vêm de capabilities realmente pertencentes à conta. `handleTelegramConciergeAsk` aceita localização e pode gravar snapshot; não é usado como ferramenta nem chamado por este host. Extrair/ligar o núcleo autenticado read-only exige revisão própria do responsável. Nenhum endpoint novo foi instalado, e autenticação/OAuth/DB reais não foram testados.
- Offline do cliente permanece exatamente na #1203, sem importar classificador ou transporte. Este host não transforma fallback servidor em certificação offline.
- Portões/financeiro não entram na allowlist desta entrega. Ampliar exige readers autorizados e motores existentes, nunca argumentos livres ou cálculo do modelo.

## Evidência e limites

O teste executável compara frases que o reconhecedor anterior devolve unsupported (contraprova RED) com a nova composição usando **labels mockados** e facts reais do motor (GREEN). Cobre paráfrases/typos, followups válidos e expirados, APZ, source normalization, injeção, saída com campos proibidos, quota/timeout, P2 tardio do transporte #1207, duas perguntas concorrentes, troca de conta/session/epoch/revisão/hash/seleção, prazo/freshness, mudança de ocorrência durante await, temporal primeiro e zero HTTP/escritas/console.

Os mocks não demonstram capacidade linguística, precisão, latência ou segurança de um modelo real. Não há IA ativa no produto. Para prosseguir faltam revisão das dependências, wiring conjunto com owner, orçamento global de inferência e decisão explícita de credencial/privacidade antes de qualquer canary autorizado com dados fictícios. Sem merge/deploy, custos, chaves, permissões ou transmissão real nesta tarefa.
