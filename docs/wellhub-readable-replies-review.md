# Academias: apresentação multicanal

Base: main 513abba571b13c1e87cdfaa881b524b6cfd5a036 (#984 e #985).
Nenhum AGENTS.md ou skill local foi encontrado; /workspace/.agents estava vazio.
Busca de PRs abertas Wellhub não encontrou mudança equivalente de apresentação.

O formatter compartilhado retorna string: app usa React com white-space pre-wrap,
Telegram envia texto sem parse_mode; não assumimos suporte Markdown no WhatsApp.
Nomes ficam em linha própria e unidades separadas por linha vazia. Não se envia
HTML/Markdown nem se modifica transporte. O consumidor do contexto precisa
reconhecer o novo cabeçalho para preservar preferência de plano/modalidade.

Exemplo **sintético**, antes (duas unidades):

```text
Wellhub verificado · seu plano Silver+
Contexto local: Cidade Exemplo CE. Resultados fora da cidade/estado confirmado são descartados.
1. Academia Exemplo A · Cidade Exemplo/CE
   Acesso: ✓ incluído no seu Silver+ · mínimo da unidade: Basic+ (snapshot público)
   Snapshot público; acesso e disponibilidade atuais não confirmados.
   Endereço: Rua Exemplo, 10
   Condições: Agendamento necessário, exceto musculação.
   Horário: seg-sex 05:00-22:00
   Modalidades: consulte o app Wellhub para modalidades e disponibilidade atual
   Data registrada no snapshot: 2026-10-10; fonte não consultada agora: [link oficial A]
2. Academia Exemplo B · Cidade Exemplo/CE
   Acesso: ✓ incluído no seu Silver+ · mínimo da unidade: Silver (snapshot público)
   Snapshot público; acesso e disponibilidade atuais não confirmados.
   Endereço: Rua Exemplo, 20
   Horário: seg-dom 00:00-23:59
   Modalidades: consulte o app Wellhub para modalidades e disponibilidade atual
   Data registrada no snapshot: 2026-10-10; fonte não consultada agora: [link oficial B]
```

Depois, mesma informação de cadastro:

```text
Academias · Cidade Exemplo/CE · Silver+

1. Academia Exemplo A
Plano mínimo: Basic+ · compatível com Silver+ pelo cadastro
Endereço: Rua Exemplo, 10
Horário cadastrado: seg-sex 05:00-22:00
Condição: Agendamento necessário, exceto musculação.
Fonte oficial: [link oficial A]

2. Academia Exemplo B
Plano mínimo: Silver · compatível com Silver+ pelo cadastro
Endereço: Rua Exemplo, 20
Horário cadastrado: seg-dom 00:00-23:59
Fonte oficial: [link oficial B]

Cadastro consultado em: 2026-10-10.
Catálogo parcial, sem atualização automática; fontes não consultadas agora. Acesso, horários e disponibilidade de modalidades atuais não confirmados. O limite técnico de 90 dias do CrewCheck não garante vigência no Wellhub. Confirme acesso e condições no app Wellhub antes de sair.
Para alterar: “meu plano é Silver+”, “uso Gold” ou “quero Pilates”.
```

Datas iguais aparecem uma vez; datas diferentes permanecem por unidade. Dados
vencidos/inválidos/futuros e mínimo desconhecido conservam acesso não confirmado.
Modalidade solicitada mantém o mínimo específico; ausência de regra é explícita.
Agendamento Greenlife e horários Basic restritos MaxForma permanecem integrais.
O texto da nota só troca a palavra técnica snapshot por cadastro. Endereços não
são truncados para evitar apagar bairro/número. URL oficial HTTPS fica explícita;
URL insegura não vira link. Não se inventa distância nem funcionamento agora.

Regressão nova executa formatter raw/materializado, datas diferentes, controles
em nomes, caracteres HTML/Markdown literais, restrições e avisos não duplicados.
Executa o payload Telegram existente com fetch fictício, sem parse_mode nem
mensagem real; o teste multicanal existente executa app/Telegram/WhatsApp.
As quatro unidades Fortaleza e rodapé cabem no limite existente de 3900 caracteres.
A revisão reproduziu no HEAD inicial 0c097cac Brasília/DF + Silver+ + Treino
de força (4318 caracteres, aviso em 3969): os limites Telegram 3900 e WhatsApp
4000 removiam ressalvas essenciais; Cycle reproduzia. Corrigido no formatter
compartilhado usando o teto mais estrito, 3900 unidades UTF-16, sem modificar
transportes. Rodapé integral é reservado antes de incluir unidades. Apenas
um prefixo de blocos completos é publicado; a mensagem diz quantas unidades
deste resultado aparecem e pede refinar por rede/unidade. Nenhum novo envio
ou comando de paginação fictício é ativado. Se uma unidade não cabe completa,
a resposta explica isso e mantém busca oficial e aviso; não afirma catálogo vazio.

Casos DF atuais: Treino de força 3635 e Cycle 3605 caracteres, ambos com 6 de
8 blocos completos e aviso integral. Testes usam limites 3900/4000/1500/1000/800/600,
comparam blocos exibidos ao formatter da mesma unidade isolada e executam os
payloads Telegram/WhatsApp com helpers/fetch fictícios. Datas, links, condições,
horários e mínimo por atividade não são fatiados. Nome com emoji e condição
excepcionalmente longa valida fallback sem fragmento. O parâmetro interno
de teste pode reduzir o limite até 600; não aumenta o teto de produção nem
é passado pelos handlers de canal. App recebe a mesma resposta compacta.

Não altera catálogo, tiers, filtros, coletor, autorização, GPS, transporte real,
AIMS, notificações ou Play. Não comprova SHA em produção/Render. Draft para
revisão independente; sem merge ou publicação nesta tarefa.
