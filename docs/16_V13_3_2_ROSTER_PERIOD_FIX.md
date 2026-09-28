# CrewCheck v13.3.2 — Roster Period Fix

Correção do mês exibido da escala.

## Problema

A escala podia exibir `Junho` mesmo quando o PDF carregado era `Julho`, porque o núcleo canônico normalizava os dias, mas preservava `roster.month`/`roster.year` antigos.

## Correção

- `normalizeRosterDays` agora infere `month/year` pelo período publicado do PDF (`01-Jul-2026 to 31-Jul-2026`).
- Se não houver período no texto, infere pelo mês/ano majoritário dos dias normalizados.
- `monthLong` na Home passa a preferir a primeira data real da escala.
- Adicionada regressão garantindo que PDF de Julho não apareça como Junho.
- Layout Premium/EFB preservado.
- Parser AIMS preservado.
