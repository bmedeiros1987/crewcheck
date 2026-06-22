# CrewCheck v11.0.21 — Sincronização da última escala por usuário

## Objetivo

Garantir que a escala importada por um usuário seja salva na base e carregada automaticamente em outros dispositivos da mesma conta, sem misturar dados entre usuários.

## Ajustes

- Novo endpoint seguro `GET /api/rosters/latest` com filtro obrigatório pelo usuário autenticado.
- Ao abrir o app, se não houver escala ativa na sessão, o CrewCheck busca a última escala salva da conta.
- A escala carregada alimenta Cockpit, Escala, Diárias, Salário, Saída Inteligente, Radar e Agenda.
- Fallback local por usuário quando a conexão ou a base estiver indisponível.
- A sincronização continua isolada por `user_id`, evitando exibir escala de outra conta.
- A importação de PDF continua salvando automaticamente a escala na base e também no dispositivo.

## Android

- versionName: 11.0.21
- versionCode: 11021
