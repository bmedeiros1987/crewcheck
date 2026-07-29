# CrewCheck Atlas — P0 básico

## Objetivo

Preparar somente as correções essenciais e de baixo risco antes da retomada completa no Work.

## Escopo deste lote

1. Proteger o motor canônico da escala.
2. Separar Folga/Descanso de Programação.
3. Corrigir menu, largura, scroll e identificação do usuário.
4. Padronizar os textos mais visíveis em pt-BR.
5. Diagnosticar o Google Maps sem expor erro técnico ao usuário.
6. Manter as vozes de Bruno e Daniel independentes.

## Fora do escopo por enquanto

- reconstrução do FlyDeck;
- nova Central Admin;
- Locais Próximos completo;
- novas integrações;
- mudanças profundas no parser;
- deploy sem validação.

## Ordem de execução quando o Work estiver disponível

- [ ] Registrar baseline do repositório e da escala.
- [ ] Executar TypeScript, build web e smoke test do servidor.
- [ ] Aplicar Folga x Programação.
- [ ] Validar que datas, horários, origem, destino e continuidade não mudaram.
- [ ] Corrigir App Shell e menu.
- [ ] Revisar textos prioritários em pt-BR.
- [ ] Auditar chave e APIs do Google Maps.
- [ ] Separar as variáveis de voz do Bruno e do Daniel.
- [ ] Validar desktop, Android e iPad.

## Bloqueios atuais

- GitHub Actions sem créditos; checks do PR #206 encerraram antes de executar etapas.
- PR #206 não deve ser mesclado até validação local ou no Work.

## Regra de segurança

Nenhuma correção visual pode alterar quantidade de atividades, datas, horários, apresentação, origem, destino, continuidade, pernoite, reserva, sobreaviso ou virada de meia-noite.
