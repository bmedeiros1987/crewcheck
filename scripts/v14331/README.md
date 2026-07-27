# CrewCheck v14.3.31 — Saída Inteligente canônica

Esta etapa corrige a seleção da programação usada pela Saída Inteligente.

- seleciona a primeira atividade presencial válida pela data e hora absolutas;
- em jornadas de voo, usa somente a primeira perna com apresentação;
- mantém número do voo, origem, destino, apresentação e data civil;
- usa o aeroporto de origem da primeira perna como destino terrestre;
- ignora pernoite, folga, EAD e sobreaviso sem acionamento;
- permite reserva, treinamento, reunião e demais atividades presenciais reconhecidas;
- bloqueia cálculo e alertas quando a localização ou a rota terrestre não combinam com o aeroporto de apresentação;
- remove o fallback silencioso que transformava uma rota incompatível em estimativa local;
- publica a versão web 14.3.31 com atualização automática do cliente.

Caso principal de regressão: usuário em Florianópolis, voo iniciando em FLN e jornada terminando em BSB. A rota terrestre deve terminar em FLN, e BSB deve permanecer apenas como destino posterior/final da programação.
