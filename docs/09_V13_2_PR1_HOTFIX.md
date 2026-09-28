# CrewCheck v13.2.0 — PR #1 Hotfix funcional

Este hotfix reforça a branch `codex/v13-restore-functional`, sem merge direto na `main`.

## Correções aplicadas

- Próxima Programação agora considera evento vigente, não apenas eventos futuros.
- Escala completa ancora no evento de hoje/em andamento ou no próximo evento real.
- Diárias deixam de ser apenas `voos * valor` e passam a usar janelas LT:
  - Café 05:00–08:00;
  - Almoço 11:00–13:00;
  - Jantar 19:00–20:00;
  - Ceia 00:00–01:00;
  - Pernoite com almoço + jantar;
  - Internacional separado por valor USD convertido.
- Salário deixa de ser apenas `voos * setor` e passa a estimar:
  - produtividade;
  - chefe de cabine pelo primeiro tripulante listado;
  - instrutor pelo perfil;
  - horas noturnas;
  - bruto/líquido;
  - INSS, IRRF e FGTS estimados.
- Despertador Inteligente recebe:
  - dormir;
  - acordar;
  - sair;
  - modo de notificação configurável;
  - texto sem expor nome de API.
- Hotéis reforçados para pernoite, wake-up e entorno.
- Versão atualizada para 13.2.0.
- Layout Premium/EFB preservado.

## Segurança

Não armazena senha, MFA, SMS, cookies, sessão ou credenciais corporativas.
