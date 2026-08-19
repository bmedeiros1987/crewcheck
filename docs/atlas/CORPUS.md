# Atlas — Corpus de escalas

Dois corpora distintos, não misturáveis (ver `#527`).

## Corpus iFlight (#233) — existente

- 68 escalas históricas já usadas pelo projeto.
- Não usar como prova da importação AIMS/Crewtopia — formatos e caminho de parser são diferentes.

## Corpus AIMS/Crewtopia (#527) — **bloqueado, em aberto**

```yaml
claim: "Amostras reais AIMS/CrewRoster (múltiplas revisões, formatos CrewRoster Report e Escala AIMS convertida) foram entregues pelo Bruno em 18/08/2026."
status: A_CONFIRMAR
source: "Relato do Bruno na conversa"
validated_by: null
evidence_ref: "#527"
recorded_by: claude
date: 2026-08-19
```

**Estado real:** os arquivos ainda não chegaram à sessão do Claude neste ambiente (Claude Code Remote). Duas tentativas de anexo no chat não resultaram em conteúdo de arquivo recebido — nem no filesystem da sessão, nem como bloco de conteúdo na mensagem. Teste pendente: anexar um PDF pequeno isolado para confirmar se o canal de anexo funciona neste tipo de sessão.

### Regra de privacidade (vale independente de onde os originais acabarem ficando)

- Os PDFs originais são material privado/local. **Nunca commitar sem sanitização.**
- O repositório público (`crewcheck`) só recebe **fixtures sanitizadas pré-parser** — estrutura suficiente para reproduzir o caso, sem dados pessoais desnecessários.
- Referenciar os originais por revisão/hash no Atlas, nunca pelo conteúdo.

### Quando os arquivos chegarem

1. Agrupar por revisão (republicações da mesma escala não se fundem silenciosamente).
2. Formar pares CrewRoster Report <-> Escala AIMS convertida por revisão.
3. Sanitizar e gerar fixture pré-parser por caso.
4. Produzir oracle explícito por fixture (atividades, APZ, STD/STA, boundaries, tempo em solo, pernoite, RES/HSB/ASB/DO/DR, continuidade física) — ver schema em `QA_ORACLES.md`.
5. Rodar o pipeline real de importação AIMS (não funções intermediárias) contra cada fixture.
6. Gerar matriz PASS/FAIL/REVIEW comparando artifact canônico x oracle.
7. Nunca ajustar a fixture/oracle para o teste passar — divergência vira causa-raiz investigada no parser/derivação.
