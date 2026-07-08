# CrewCheck v13.2.1 — Hotfix pós-merge

Correção preventiva após o PR #1.

## Ajuste

A Próxima Programação geral pode continuar considerando voo, duty ou pernoite quando fizer sentido para Cockpit/Escala.

As telas específicas de voo agora recebem preferencialmente o próximo voo real:
- Saída Inteligente;
- Radar;
- Meteorologia;
- Despertador Inteligente.

Isso evita que HOTEL/STAY/DUTY seja enviado para telas que esperam dados de voo.

## Segurança

Sem alteração de parser canônico.
Sem credenciais, senha, MFA, SMS, cookies ou sessão.
Layout Premium/EFB preservado.
