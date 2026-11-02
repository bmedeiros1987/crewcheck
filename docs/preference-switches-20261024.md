# Switches de preferências e salário

Os prints fornecidos mostram Notificações: Avisos BIDS e Outros avisos e
despertador. O seletor salarial foi identificado no código e coordenado com o
responsável financeiro; não aparece nos prints.

`PreferenceSwitch` preserva o checkbox nativo, com papel switch, teclado Espaço,
área de toque de 48 × 44 px, foco visível, estado desabilitado, contraste e redução
de movimento. O trilho e a bolinha são decorativos e não controlam o estado.
As ações Salvar, importar preferências e autorizar notificações continuam botões.

Notificações mantém o rascunho e o salvamento explícito por conta. O switch não
concede permissões, vincula canais, agenda ou envia avisos. O seletor salarial
Líquido usa a preferência existente: ligado seleciona net e desligado gross.
O título acompanha a seleção; os cálculos, dados e persistência existentes não
mudam. Ausência de dados continua Não calculável.

Regressões: componentes reais raw/prepared, app compilado em 320/390/1440 px,
temas claro/escuro, teclado, reload, mascaramento e troca de conta. Fixtures usam
somente dados inventados e bloqueiam serviços externos. Não há validação de
aparelho físico, mudança de backend, service worker, canais pagos ou IA.
