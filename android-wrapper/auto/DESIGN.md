# CrewCheck Drive — interface no Android Auto

A experiência do carro usa templates nativos da Car App Library. A linguagem da TV
informa hierarquia, cores e tom, mas o DHU/central controla geometria e tipografia.
O aplicativo continua na categoria POI e entrega a navegação curva a curva ao GPS
escolhido pelo usuário.

## Telas

| Tela | Informação | Ação |
| --- | --- | --- |
| Destinos | Até o limite do host; destinos manuais e destino operacional vigente | Abrir detalhe ou Hoje |
| Hoje | Voo atual, apresentação publicada e destino terrestre quando houver | Abrir rota no GPS |
| Folga/sem dados | Estado explícito; nenhuma viagem inventada | Voltar aos destinos manuais |
| Destino | Nome, busca enviada ao GPS e contexto | Buscar rota |

A página Hoje nunca calcula APZ nem horário de apresentação. O estado de folga
não promove voo antigo. O botão de rota revalida contexto, opt-in, destino e
validade no momento do toque, inclusive se a tela antiga ainda estiver visível.

## Próxima integração Mobile Core: APZ e chegada prevista

A ponte atual #848 só permite campos do watchSnapshot v1 (estado, apresentação,
voo, pernoite). Ela não publica APZ, endereço estruturado nem uma estimativa de
trajeto. Antes de expor esses valores no carro, Mobile Core deve produzir uma
projeção nova e versionada, com origem canônica e identidade da jornada:

- APZ oficial e apresentação como instantes distintos, com data/fuso de origem;
- destino estruturado e verificado, com ID estável, aeroporto/terminal/entrada
  somente quando comprovados;
- alternativas de rota fornecidas por serviço de rotas autorizado, com ETA,
  duração, instante da consulta, validade curta e destino a que pertencem;
- nenhuma localização contínua, credencial, CPF, PDF ou escala completa no IPC;
- invalidação imediata em logout, troca de conta, revogação ou troca de jornada.

A comparação de pontualidade usa **ETA até a apresentação**, e não APZ.
APZ é exibido como referência operacional separada. Se ETA, destino ou
apresentação estiverem ausentes/vencidos, a margem não aparece. O GPS externo
pode escolher outra rota após o handoff, então a prévia não deve prometer
chegada. A escolha de provedor (TomTom/Google ou outro), custo, credencial e
qualidade devem ser resolvidos pelo owner Mobile/backend antes da integração.

Uma lista mensal como a TV não é apropriada ao fluxo em movimento. No carro,
mostrar somente o contexto atual/próximo necessário ao deslocamento; o restante
fica no telefone/TV. Testar legibilidade e limite de templates em DHU e central
física estacionada antes de avançar para distribuição.

## Escala e status do voo

A ação Escala abre somente o contexto atual publicado pelo Mobile Core v1: voo,
apresentação e destino vigente. Não representa a escala completa do dia ou do mês.
Enquanto a ponte não entrega status e portão, o carro informa “Aguardando
informação confirmada”; não usa portão de voo anterior nem inventa um status.

Para publicar status real, Mobile Core deve projetar um contrato v2 com identificador
de voo, data/local operacional, portão e terminal confirmados, fonte e horário da
última verificação, validade curta e invalidação explícita em mudança de jornada,
logout ou alteração do voo. O consumidor deve omitir dado expirado e manter a
navegação no GPS independente da disponibilidade do status. A integração com
provedor operacional e a implementação autoritativa no celular pertencem à trilha
Mobile Core; não foram incluídas nesta PR de periféricos.

A marca recebida do usuário foi reduzida proporcionalmente para recurso Android
sem alterar a composição. O host escolhe a apresentação do ícone; slogans e texto
miúdo podem não ser legíveis na barra lateral do carro.
