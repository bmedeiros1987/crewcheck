# CrewCheck v13.8.3 Draft 1 - Aprendizado financeiro

Pacote de sobreposição para a `main` 13.8.2. Não altera o parser AIMS/CrewRoster,
o motor canônico, calendário, autenticação ou radar.

## O que já está pronto

- reconhecimento de demonstrativo de diárias e folha mensal;
- competência e data de pagamento;
- café, almoço, jantar e ceia;
- salário-base, KM diurno/noturno, KM DFS, reserva e sobreaviso;
- histórico temporal por competência;
- deduplicação pelo conteúdo do documento;
- confirmação obrigatória antes de uma tarifa entrar nos cálculos;
- tabelas PostgreSQL idempotentes e índice de consulta;
- proteção LGPD: não guardar texto integral, banco ou conta.

## Valores de regressão comprovados nos documentos de Bruno

- refeição integral: R$ 109,44;
- café: R$ 27,36;
- KM diurno: R$ 0,058547;
- KM noturno e DFS: R$ 0,117094;
- reserva observada: R$ 49,765/h;
- sobreaviso observado: R$ 16,587/h.

Esses números são amostras de regressão, não constantes globais. O motor só usa
um valor aprendido depois da confirmação e respeita a data de vigência.

## Integração final quando o repositório completo estiver disponível

1. Copiar `client/src/lib/financialStatementLearning.ts`.
2. Aplicar a migration após a migration de fundação da v14, se ela já estiver na main.
3. Conectar a extração de texto já usada pelo PDF.js ao `learnFinancialStatement`.
4. Criar a tela "Importar demonstrativo" em Diárias e Salário.
5. Exibir comparação valor atual, valor encontrado, diferença e competência.
6. Exigir confirmação explícita; permitir rejeitar ou corrigir um valor.
7. Persistir somente o resumo e as tarifas confirmadas.
8. Resolver a tarifa com `rateAt`; sem valor aprendido, usar ACT/Admin e sinalizar a fonte.
9. Adicionar o script de regressão ao `package.json`.
10. Executar TypeScript, build web, regressões 13.8.0/13.8.1/13.8.2 e Android.

## Prioridade das fontes

1. Valor confirmado do demonstrativo, válido para a competência.
2. Ajuste individual confirmado pelo usuário/Admin.
3. Catálogo do ACT vigente.
4. Sem valor: mostrar pendência, nunca inventar.
