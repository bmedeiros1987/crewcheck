# P1 — Clareza operacional e padrão visual (v14.3.57)

## Problema observado

A tela atual concentra muitos elementos grandes, repete informações e exige interpretação do usuário. A Linha do Dia apresenta uma sequência tecnicamente correta, mas pouco orientada à decisão. O cartão de próxima programação informa dados, porém não deixa claro o que o tripulante precisa fazer. A tela de login é excessivamente grande e não segue um padrão familiar de autenticação.

## Objetivo

Tornar o CrewCheck mais familiar, objetivo e previsível sem alterar o motor canônico da escala.

## Escopo deste lote

### 1. Próxima programação

- reduzir excesso de altura e espaços vazios;
- manter data, atividade, local, apresentação, início/fim e status;
- destacar a ação principal;
- evitar duplicidade com a Linha do Dia;
- não sugerir rota automática para atividades inelegíveis.

### 2. Linha do Dia

- acrescentar resumo de **Agora** e **Próximo compromisso**;
- traduzir códigos operacionais comuns para nomes humanos, preservando o código quando útil;
- limpar metadados repetidos como “A confirmar”; 
- indicar visualmente o item atual e o próximo;
- oferecer ações diretas: Ver escala, Ver voo ou Ver hotel;
- manter ordem cronológica e a classificação canônica existente.

### 3. Login

- cartão central compacto, inspirado em padrões familiares de acesso como Gmail, sem copiar marca ou identidade visual;
- campos simples, sem caixas aninhadas desnecessárias;
- título e instruções curtos;
- cadastro e recuperação preservados;
- contraste completo nos temas claro e escuro;
- nenhum dado corporativo ou credencial armazenado fora do fluxo existente.

### 4. Padrão visual

- mesma largura de conteúdo entre FlyDeck e Linha do Dia;
- raios, bordas, tipografia e espaçamentos consistentes;
- navegação inferior apenas em telas móveis, evitando sobreposição no desktop;
- nenhuma alteração no parser, continuidade, financeiro ou regulamentação.

## Critérios de aceite

- [ ] usuário identifica em poucos segundos o que está acontecendo agora;
- [ ] usuário identifica o próximo compromisso e seu horário;
- [ ] HSB aparece como “Sobreaviso”, sem depender apenas da sigla;
- [ ] portão e terminal não repetem “A confirmar”;
- [ ] a Linha do Dia não fica coberta pela navegação no desktop;
- [ ] login cabe confortavelmente em notebook e celular sem rolagem excessiva;
- [ ] TypeScript, build Web, regressões e teste do servidor aprovados;
- [ ] motor canônico preservado.

## Fora do escopo

- reconstrução do parser;
- novo provedor de mapas ou radar;
- Central Admin completa;
- inteligência preditiva;
- automação do iFlight além das travas já existentes.
