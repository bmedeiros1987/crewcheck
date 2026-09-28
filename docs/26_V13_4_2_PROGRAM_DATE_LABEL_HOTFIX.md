# CrewCheck v13.4.2 — programDateLabel Hotfix

## Problema

Após a v13.4.1, o app podia abrir a proteção global com:

`ReferenceError: programDateLabel is not defined`

## Causa

O Gerenciador de Apresentação chamava `programDateLabel(event)`, mas essa função pertencia ao pacote v13.4.0 Program Detail Lounge e não estava garantida na `main`.

## Correção

- Adiciona `programDateLabel(event)` diretamente em `Home.tsx`.
- Inclui fallback seguro para data inválida.
- Adiciona chamada defensiva no Gerenciador de Apresentação.
- Atualiza versão para `13.4.2`.
- Regressão estática para impedir retorno da tela branca.

## Preservado

- Gerenciador de Apresentação v13.4.1.
- Motor canônico da escala.
- Parser AIMS/CrewRoster.
- Layout Premium/EFB.
- Sem credenciais, senha, MFA, SMS, cookies ou sessão.
