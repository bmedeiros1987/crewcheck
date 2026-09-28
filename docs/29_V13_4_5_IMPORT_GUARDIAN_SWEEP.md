# CrewCheck v13.4.5 — Import Guardian / Stability Sweep

## Objetivo

Evitar que o usuário importe uma escala de mês errado e só perceba depois que o Cockpit não mostra programação futura.

## Inclui

- Confirmação antes de salvar a escala.
- Resumo do PDF importado:
  - arquivo;
  - período detectado;
  - tripulante;
  - base;
  - dias publicados;
  - voos;
  - atividades;
  - folgas/descanso;
  - próxima programação detectada.
- Alerta quando o período detectado é diferente do período atual.
- Alerta quando não existe programação futura após agora.
- Salva o último resumo de importação localmente.
- Mantém fallback cronológico seguro no Cockpit quando o índice canônico não retorna evento.

## Preservado

- Parser AIMS/CrewRoster.
- Motor canônico da escala.
- Roster inline expansível.
- Gerenciador de Apresentação.
- Layout Premium/EFB.
- Sem credenciais, senha, MFA, SMS, cookies ou sessão.
