# Artefato de manutenção de hotéis — HOLD

O candidato normal continua com o contrato v2 revisado. O gerador
`scripts/build-hotel-maintenance.mjs` cria **outra árvore** a partir de um commit,
sempre em diretório novo, e aplica três barreiras em dois arquivos:
rota de edição, transação direta e reconciliação de hotéis. Um terceiro arquivo,
o cache de preparação, ignora apenas os dois certificados gerados para que o seal
não provoque replay histórico no startup. Não modifica checkout,
schema, configuração externa, autenticação, billing ou exclusão de conta.
Não há opção para produzir variante gravável nem flag de ambiente de ativação.

O artefato permite GET autorizado com quartos e versões preservados, mas informa
`hotelWriteReady:false` / `maintenance-read-only`. POST/PATCH legado, v1/v2,
retries e chamadas diretas de edição retornam indisponível com
`HOTEL_MAINTENANCE_READ_ONLY` e `persisted:false`, antes de DML. Sync continua
salvando roster/compliance/gym, com hotéis `review-required` / `maintenance-read-only`,
sem hotel/rule INSERT/UPDATE/DELETE e sem replay posterior de edição.
A barreira independe da presença ou prontidão do schema.

## Construção e checkpoint local/CI

Executar somente em ambiente de revisão isolado, usando um commit aprovado e
as dependências já conferidas pelo lockfile. Exemplo de preparação de artefato:

```sh
node scripts/build-hotel-maintenance.mjs --output /tmp/hotel-maintenance-review
```

O destino deve ser absoluto e inexistente. Somente arquivos commitados entram
pelo `git archive`; arquivos privados, credenciais locais e alterações não
commitadas não são copiados. Dependências não integram o archive e devem vir do
lockfile conferido. O resultado inicial é raw, **não uma autorização de deploy**.

O CI existente testa raw e preparado, preparação repetida/cache-hit e o smoke
existente de build/start sem credenciais ou egress. Depois sela a árvore com:

```sh
node scripts/build-hotel-maintenance.mjs --seal /tmp/hotel-maintenance-review
```

`hotel-maintenance-manifest.json` registra SHA/tree de origem, lockfile, hashes
dos arquivos efetivos (incluindo materializadores, bootstrap e outputs gerados),
fingerprint da árvore e HOLD. Dependências, caches, artefatos de QA e o próprio
manifesto ficam fora desse fingerprint; lockfile e ambiente de build precisam
constar do checkpoint operacional. A geração/seal verifica as barreiras e falha
se os anchors revisados divergirem. Mudança posterior exige novo seal e revisão.
O hash da árvore raw difere do hash preparado; usar o checkpoint final testado.

## Limites e sequência operacional futura

A exclusão de conta é um writer separado e **não foi bloqueada ou certificada**
por este artefato. Não se promete ausência global de escrita em stays. Seu owner
precisa certificar hold coordenado antes de efeitos externos/SQL; não fazer
exclusão parcial nem contornar a fronteira restrita de auth/billing.

Também não se certificam writers externos, triggers, todas as réplicas ou trabalhos
em voo por inventário estático. Antes de ativação separadamente autorizada,
inventariar instâncias/versões, drenar todos os processos antigos e trabalhos
assíncronos, e distribuir o mesmo artefato revisado a todos os writers identificados.
Acesso/schema/backup/restauração operacional e janela continuam pendentes.

O rollback proposto distribui este artefato preservando colunas, índices, IDs,
vínculos, snapshots, overrides e versões. Não retornar ao writer antigo de sync,
remover schema, zerar versões ou restaurar dump antigo sobre dados vivos.
Este mecanismo é uma entrega para revisão; nenhum deploy, flag, migração ou banco
real foi executado e merge continua bloqueado pela revisão operacional.
