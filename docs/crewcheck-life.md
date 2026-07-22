# CrewCheck Life

## Propósito

O CrewCheck Life é um assistente de rotina para tripulantes. Ele organiza descanso, estudos, atividade física, alimentação, deslocamentos e tempo pessoal ao redor da escala operacional.

Não é um produto médico. Não diagnostica, não determina aptidão, não substitui avaliação profissional e não substitui os canais oficiais de reporte de fadiga.

## Implementação v14.3.4

A primeira entrega funcional inclui:

1. ativação voluntária com consentimento explícito;
2. objetivos pessoais de sono, estudo e atividade;
3. entrada manual que funciona no navegador, Android, iPhone e iPad;
4. recomendações explicáveis ligadas à próxima programação;
5. ponte nativa Android para Health Connect;
6. Samsung Health e Galaxy Watch por meio da sincronização oficial com Health Connect;
7. interface web preparada para o futuro adaptador Apple HealthKit;
8. pausa, revogação e exclusão dos dados locais;
9. manual incorporado ao sistema e tutorial de primeiro acesso ampliado.

Na v14.3.4, o resumo lido do Health Connect permanece no aparelho e **não é enviado ao servidor**. A sincronização futura de qualquer resumo dependerá de finalidade documentada e de um novo consentimento específico.

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

- Ativar CrewCheck Life;
- Agora não;
- Ler como seus dados são usados.

Nenhuma permissão de saúde deve ser solicitada antes da ativação voluntária. O tutorial apenas apresenta a ferramenta e nunca abre a autorização do sistema.

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
- estágios de sono, quando disponíveis, somente para calcular o resumo;
- atividade física recente e duração;
- passos e distância agregados;
- tendência pessoal de frequência cardíaca de repouso, sem exposição de série bruta.

Não solicitar dados clínicos, diagnósticos, medicamentos, exames, fertilidade, peso, pressão arterial, glicose ou prontuários.

## Plataformas

### Android

1. Health Connect é a integração padrão, usando a versão estável `androidx.health.connect:connect-client:1.1.0`.
2. Samsung Health sincroniza sono, atividade e outros dados autorizados com Health Connect. Isso também cobre dados trazidos pelo Galaxy Watch para o Samsung Health.
3. O usuário escolhe os tipos de dados na tela oficial do Android.
4. O CrewCheck confere novamente as permissões antes de cada leitura.
5. A entrada manual permanece como fallback completo.

O manifesto solicita somente leitura de sono, passos, distância, exercícios e frequência cardíaca de repouso. Não solicita escrita, histórico ampliado nem leitura em segundo plano nesta primeira entrega.

Antes de publicar o novo AAB, os mesmos tipos precisam ser declarados no formulário de permissões de saúde do Google Play Console e a política mostrada pelo app precisa corresponder à política cadastrada na loja.

Referências oficiais:

- [Health Connect: começar](https://developer.android.com/health-and-fitness/health-connect/get-started)
- [Health Connect: versões Jetpack](https://developer.android.com/jetpack/androidx/releases/health-connect)
- [Samsung Health via Health Connect](https://developer.samsung.com/health/health-connect-faq.html)

### iOS

1. A interface web reconhece o handler nativo `CrewCheckHealthKit`.
2. O adaptador HealthKit será ativado no aplicativo iOS quando o projeto Xcode, a conta Apple Developer e a capability HealthKit estiverem disponíveis.
3. O iOS deverá pedir autorização em contexto e somente para sono, passos, distância, atividade e tendência resumida de frequência em repouso.
4. A entrada manual funciona enquanto o app iOS não for publicado.

Detalhes: [crewcheck-life-ios-healthkit.md](./crewcheck-life-ios-healthkit.md).

O PWA não promete acesso direto aos repositórios de saúde. A leitura completa depende do aplicativo nativo e das permissões do sistema operacional.

## Contrato da ponte nativa

Eventos emitidos para a interface web:

- `crewcheck:health-status`: disponibilidade e quantidade de permissões autorizadas;
- `crewcheck:health-summary`: resumo agregado local de até 30 dias.

Métodos Android expostos somente no WebView oficial:

- `status()`;
- `refreshStatus()`;
- `requestPermissions("1.0")`;
- `readSummary("7", "1.0")`;
- `revokePermissions()`.

A versão do consentimento é obrigatória para abrir a autorização e para ler o resumo.

## Motor de rotina

Ordem de prioridade:

1. programação operacional;
2. deslocamento e preparação;
3. descanso pessoal desejado;
4. alimentação;
5. estudo, atividade física e lazer.

O motor deve buscar janelas úteis sem sacrificar o descanso desejado. Quando não houver janela adequada, deve recomendar não encaixar atividades adicionais.

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

Cada orientação oferece “Por que estou vendo isso?”, mostrando apenas os fatores utilizados, por exemplo:

- apresentação às 05:20;
- meta pessoal de 7h30 de sono;
- atividade recente resumida;
- preferência de estudo;
- ausência de um horário completo na escala.

## Exclusão e retenção

- pausar o CrewCheck Life sem apagar objetivos;
- revogar as permissões nativas;
- apagar o resumo trazido do repositório de saúde;
- apagar todo o consentimento, objetivos e lançamentos locais;
- não reutilizar dados para publicidade, vendas, estatísticas ou treinamento genérico;
- não copiar dados brutos de saúde para o servidor.

O CrewCheck principal continua funcionando normalmente quando o CrewCheck Life está desativado.
