# CrewCheck v13.2.2 — Hotfix parser CrewRosterReport

Corrige erro ao importar PDF CrewRosterReport:

`Invalid regular expression ... Nothing to repeat`

## Causa

Um `new RegExp()` dinâmico no parser de continuação de jornada usava escapes que podiam chegar ao navegador como regex inválida em voos com `(+1)`.

## Correção

- Escapa corretamente `\s`, `\S`, `\d`, `\(` e `\+` no construtor `RegExp`.
- Escapa número do voo e origem antes de montar a expressão.
- Mantém o parser canônico e a lógica de continuação.
- Atualiza versão para 13.2.2.

## PDF alvo

CrewRosterReport julho/2026 com voos `(+1)`, ASB, HSB, DR, DO, DOF e continuidade para agosto.
