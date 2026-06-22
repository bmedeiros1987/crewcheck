# CrewCheck v11.0.15 — correção definitiva Invalid time value

Correção aplicada após persistência do erro ao abrir a tela Minha Escala.

## Ajustes
- Results.tsx agora usa parser de datas tolerante para DD/MM/AAAA, DD-MM-AAAA, AAAA-MM-DD e textos como SEG 22 JUN.
- Removidos caminhos que chamavam toISOString em datas inválidas na escala.
- useFlightStatus e cache do radar privado agora usam dateOnlyIsoSafe.
- buildBaseEvent agora usa fallback seguro antes de montar targetIso, weekday e mês.
- Google Calendar sync agora calcula período com parser seguro, evitando erro em DD/MM/AAAA.
- Calendar export agora também usa parseDate seguro.
- Erro técnico Invalid time value não deve aparecer ao abrir a escala.

## Validação
- npm run check: OK
- npm run build: OK

## Android
- versionName: 11.0.15
- versionCode: 11015
