# CrewCheck v11.0.14 — correção de horário inválido na abertura

## Correção principal

- Corrigido erro visual `Invalid time value` ao abrir a tela **Minha Escala**.
- O sistema agora valida datas antes de aplicar `toISOString`, `toLocaleDateString` e `Intl.DateTimeFormat`.
- Parser de datas do Cockpit/Escala ficou mais robusto para:
  - `DD/MM/AAAA`;
  - `DD-MM-AAAA`;
  - `AAAA-MM-DD`;
  - textos como `SEG 22 JUN`.
- Se uma data vier incompleta, vazia ou em formato inesperado, o CrewCheck usa fallback seguro e não mostra mais toast técnico para o usuário.
- Mantidas as correções da v11.0.13 de diárias de pernoite e chips financeiros visíveis.

## Android

- versionName: 11.0.14
- versionCode: 11014

## Validação

- `npm run check`
- `npm run build`
