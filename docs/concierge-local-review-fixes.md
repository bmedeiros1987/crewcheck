# Correções da revisão independente do leitor offline

Base `194c0d3b4aadafdcf8bcd78fb4647de44e64134b` incorporada por merge normal `eab8ada9a83ac6604fbdf01e988ebbe2ed20706d`, sem conflito e sem force. Antes das correções abaixo, a fatia do CrewCierge era byte-idêntica ao HEAD revisado `50669e92e44ba233171dcf8af7ba17e911d1400c`; o merge acrescentou somente #1204. Nenhum arquivo da #1135, parser, motor canônico, service worker global, permissões ou provider foi alterado.

## Sobreposição: RED reproduzido, seleção recusada

Com o motor canônico real no Chromium offline: TRAINING 10/10/2032 23:00→03:00 e 11/10/2032 01:00→05:00. A versão anterior escolhia uma programação apesar da sobreposição. A regressão nova falhou no código anterior em 11/10 00:30 BRT (sobreposição futura) e cobre também 01:30 BRT (duas simultâneas), para próxima jornada e resumo da escala.

Depois do último await, o leitor filtra intervalos semiabertos ainda pertinentes e recusa múltiplos ativos, empate de início ou sobreposição, usando a mesma regra do seletor do servidor. Retorna esclarecimento, fatos vazios e nenhum contexto. Não troca ou escolhe ocorrência silenciosamente. Controle positivo: 23:00→01:00 seguido de 01:00→05:00 continua disponível na fronteira de 01:00, com 240 minutos publicados.

## Evidência do normalizador: RED reproduzido, aceitação restrita

`normalizeRosterDays`, utilizado pelo parser PDF real, acrescenta `publishedClockEvidence` antes de selecionar/deduplicar etapas. A versão anterior recusava qualquer presença desse campo, inclusive a saída ordinária válida. A regressão com o normalizador real falhou no leitor anterior e passa com os mesmos 400 minutos depois da correção.

O leitor aceita somente evidência ordinária de um registro, com campos conhecidos, fontes e extremos exatamente iguais aos da publicação selecionada, e correspondência completa dos relógios das etapas independentemente da ordem. Não remove o campo nem o reconstrói a partir de dados já deduplicados. Evidência com `records`, campos desconhecidos, fonte divergente/estimada, relógio inválido/divergente, etapas duplicadas, ausentes ou descartadas continua indisponível. Testes passam duplicatas reais pelo normalizador e verificam que seus registros originais não desaparecem para produzir uma resposta disponível. A medição de jornada continua inteiramente no motor existente.

As fixtures da tela/salvamento e da PWA completa agora recebem a saída de `normalizeRosterDays` real, em vez de uma estrutura manual que evitava a propriedade. O teste de navegador do leitor mantém também o caso raw e agora tem 55 verificações por execução. Nenhuma chamada de modelo, conta real ou serviço externo é necessária.

Revalidar no novo HEAD: TypeScript raw/prepared, check/build completos, matrizes nos três fusos, lifecycle/contas, PWA/worker reais e regressão canônica. A CI verde do HEAD anterior não comprova estas correções. Revisão independente e autorização de publicação continuam pendentes; nenhuma autorização de merge da #1203 ou ativação do provider foi recebida.
