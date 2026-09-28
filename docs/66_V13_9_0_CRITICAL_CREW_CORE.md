# CrewCheck v13.9.0 — Critical Crew Core

Esta versão combinada parte do PR #79 e acrescenta recuperação de acesso, BIDS, CrewLock, proteção da continuidade da escala e rotina inteligente.

## Segurança

- códigos temporários com validade curta e uso único;
- documentos cifrados antes do armazenamento;
- migrações exclusivas para Aiven MySQL;
- nenhum segredo é armazenado no repositório.

## Implantação

Aplicar `migrations/20260715_005_v139_recovery_bids_crewlock.sql` no Aiven antes de ativar os novos módulos.
