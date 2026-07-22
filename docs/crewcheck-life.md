# CrewCheck Life

## Propósito

O CrewCheck Life é um assistente de rotina para tripulantes. Ele organiza descanso, estudos, atividade física, alimentação, deslocamentos e tempo pessoal ao redor da escala operacional.

Não é um produto médico. Não diagnostica, não determina aptidão, não substitui avaliação profissional e não substitui os canais oficiais de reporte de fadiga.

## Princípios obrigatórios

1. **Adesão voluntária:** o módulo só é ativado após consentimento explícito.
2. **Finalidade exclusiva:** os dados servem apenas para recomendações pessoais de rotina, disciplina, produtividade e qualidade de vida.
3. **Sem estatística coletiva:** não comparar usuários, gerar rankings, benchmarks populacionais ou métricas comerciais.
4. **Minimização:** acessar somente dados necessários para a recomendação escolhida pelo usuário.
5. **Processamento local primeiro:** preferir processamento no aparelho; sincronizar somente resumos necessários e autorizados.
6. **Controle do usuário:** permitir pausar, revogar permissões e apagar os dados do CrewCheck Life.
7. **Explicabilidade:** toda recomendação deve mostrar quais informações foram consideradas.
8. **Autonomia:** recomendações são sugestões, nunca ordens ou avaliações de aptidão.

## Fluxo de ativação

Na primeira apresentação do módulo:

> Gostaria que o CrewCheck ajudasse a organizar sua rotina de descanso, estudos, atividades físicas e tempo pessoal de acordo com sua programação?
>
> O recurso é opcional. As informações utilizadas servem exclusivamente para gerar orientações pessoais para você. Não realizamos diagnósticos, publicidade, estatísticas coletivas ou comparação entre usuários.

Ações:
- Ativar CrewCheck Life
- Agora não
- Ler como seus dados são usados

Nenhuma permissão de saúde deve ser solicitada antes da ativação voluntária.

## Áreas opcionais

O usuário escolhe individualmente:
- descanso e sono;
- estudos;
- academia e esportes;
- alimentação;
- organização pessoal;
- lazer;
- preparação para a próxima jornada;
- aproveitamento de pernoites.

## Dados permitidos

Somente quando úteis e autorizados:

### Operacionais
- apresentação e encerramento;
- quantidade de etapas;
- atividade na madrugada;
- repouso disponível;
- hotel, aeroporto e deslocamento;
- próxima programação.

### Rotina pessoal
- meta pessoal de sono;
- tempo para adormecer;
- tempo de preparação;
- preferências de treino e estudo;
- duração desejada de cada atividade;
- compromissos pessoais informados.

### Integrações de saúde
- sessões e duração do sono;
- horário de dormir e acordar;
- cochilos e interrupções;
- estágios ou pontuação de sono, quando disponíveis;
- indicador de recuperação fornecido pelo dispositivo;
- atividade física recente, duração e intensidade aproximada;
- tendência pessoal de frequência cardíaca de repouso, sem exposição de série bruta.

Não solicitar dados clínicos, diagnósticos, medicamentos, exames, fertilidade, peso, pressão arterial ou outros tipos sem relação direta com o planejamento de rotina.

## Plataformas

### Android
1. Health Connect como integração padrão.
2. Samsung Health Data SDK como aprimoramento em aparelhos compatíveis.
3. Entrada manual como fallback completo.

### iOS
1. HealthKit.
2. Entrada manual como fallback completo.

O PWA não deve prometer acesso direto aos repositórios de saúde. A leitura completa depende do aplicativo nativo e das permissões do sistema operacional.

## Motor de rotina

Ordem de prioridade:
1. programação operacional;
2. deslocamento e preparação;
3. descanso pessoal desejado;
4. alimentação;
5. estudo, atividade física e lazer.

O motor deve buscar janelas úteis sem sacrificar o descanso necessário. Quando não houver janela adequada, deve recomendar não encaixar atividades adicionais.

## Linguagem permitida

Usar:
- rotina favorável;
- preserve seu descanso;
- descanso prioritário;
- boa janela para estudo;
- boa janela para atividade física;
- reavalie sua disposição;
- sem dados suficientes.

Não usar:
- diagnóstico;
- apto ou inapto;
- fadiga clínica;
- condição médica;
- risco cardíaco;
- autorização para exercer a função.

## Transparência da recomendação

Cada orientação deve permitir abrir “Por que estou vendo isso?”, mostrando apenas os fatores utilizados, por exemplo:
- apresentação às 05:20;
- três etapas previstas;
- meta pessoal de 7h30 de sono;
- 40 minutos de deslocamento;
- preferência de estudo após acordar.

## Exclusão e retenção

- permitir apagar todo o histórico do CrewCheck Life;
- permitir apagar somente sono, estudos, treinos ou preferências;
- não reutilizar dados para publicidade, vendas, estatísticas ou treinamento genérico;
- dados brutos de saúde devem permanecer no aparelho sempre que tecnicamente possível;
- o servidor deve receber apenas resumos indispensáveis e autorizados.

## Primeira entrega funcional

1. consentimento e tela de privacidade;
2. perfil de rotina e objetivos;
3. planejamento manual de sono, estudos e treino;
4. recomendações explicáveis usando escala;
5. interface de conexão com Health Connect, Samsung Health e Apple Health;
6. adaptadores nativos separados por plataforma;
7. exclusão e revogação completas;
8. testes de regressão para garantir que o CrewCheck funcione sem o módulo ativado.
