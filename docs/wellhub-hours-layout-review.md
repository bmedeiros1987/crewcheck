# Academias: horário cadastrado e cartões compactos

Base main 500fb1c33370689b6c05a49c1d594a0df0b5bb35, publicada no Render antes desta tarefa.
Não foi encontrado AGENTS.md ou skill local em .agents. Library foi lida para
resolver a imagem privada fornecida. O helper de materialização atual falhou ao
baixar os bytes, inclusive com rede autorizada; não alegamos inspeção própria
dos pixels originais. A inspeção independente repassada confirmou título e
endereço invadindo ações/status do cartão Porão. Nenhuma imagem privada foi
salva na PR, enviada ao browser ou usada no artefato.

## Escopo e evidência visual

Reparo limitado aos cartões Wellhub: texto no fluxo, altura natural, sem clamps,
ações em grade responsiva com toque de pelo menos 44px, nomes/status/horários e
endereço em ordem visual, fonte legível e cores discretas com rótulos. A inspeção
sintética revelou estilos decorativos genéricos atingindo o span de texto; o
reset elimina essa interferência e estilos de ícones gigantes nas ações. Não
atribuímos com certeza toda a falha privada a altura fixa: a geometria completa
da captura original não pôde ser reproduzida no executor.

O browser renderiza JSX real extraído da Home preparada, com CSS de produção e
ícones Lucide reais. Usa nomes, endereços e links fictícios, sem rede. Viewports
320/390/768, fontes normal e 150%, temas claro/escuro. Compara área do texto com
início das ações, testa overflow e acesso ao primeiro título/última ação sob
barras fixas sintéticas. Cartões altos podem exigir rolagem; não se afirma que
todos os seus pixels cabem simultaneamente. Capturas ficam no artefato de CI.
A fixture inclui escaping de HTML em mensagem e alias para fonte oficial,
rejeitando domínio impostor. A fixture não é screenshot do app autenticado real.

Antes (sintético): status "Horário a confirmar" mesmo com sábado 08:00–16:00;
24h podia aparecer "Aberto agora" por flag, sem validade ou relógio; texto longo
suscetível às regras genéricas de spans e ações grandes. Depois às 18:32 locais:

```text
Academias · Fortaleza/CE · Silver+

1. [unidade 24h cadastrada]
🟢 Aberta pelo horário cadastrado
Plano mínimo: Silver · compatível com Silver+ pelo cadastro
Endereço: [endereço da unidade]
Horário cadastrado: seg-dom 00:00-23:59
Condição: [condições completas]
Fonte oficial: [URL HTTPS oficial]

2. [unidade com sábado 08:00–16:00]
🔴 Fechada pelo horário cadastrado
[plano, endereço, horários, condições e fonte completos]

Horário avaliado nesta consulta, sem acompanhamento contínuo.
[aviso único de catálogo parcial, sem consulta atual; confirmar acesso no Wellhub]
```

## Relógio, fuso e incerteza

Uma função pura compartilhada calcula status com instante absoluto e timeZone
IANA explícito da unidade. Catálogo mantém unidades/planos/endereços/fontes:
somente metadado geográfico de fuso foi acrescentado (CE America/Fortaleza;
DF/SP America/Sao_Paulo), conforme tabela do projeto IANA tzdb:
https://raw.githubusercontent.com/eggert/tz/main/zone.tab (BR, linhas CE e DF/SP).
Não usa base BSB, offset do aparelho, GPS ou geocodificação.

Busca filtra cidade/UF, plano e texto primeiro, depois ordena abertas, incertas,
fechadas com ordem estável dentro de cada grupo, antes do limite. App reordena
seus resultados já filtrados e recalcula status cada início de minuto e ao
retomar foco/visibilidade; encerra timer/listeners ao sair. Não faz fetch/GPS no
timer. Bot calcula no instante da consulta e informa ausência de relógio contínuo.
Ícones verde/vermelho/amarelo acompanham rótulos textuais; não confirma operação
em tempo real, vaga, modalidade ou acesso no plano.

Parser é estrito: dias/faixas, intervalos separados por vírgula ou ponto e
vírgula, abertura inclusiva e fechamento exclusivo; madrugada pode herdar faixa
do dia anterior. Domingo só é incerto quando falta horário aplicável. 24h não
vem do nome: exige flag e horário cadastrado coerente de sete dias. Fonte vencida,
futura/inválida, horário ausente/malformado, fuso ausente/ruim ou conflito 24h
retornam incerto. Datas nacionais comuns e período de Páscoa/Carnaval/Corpus
Christi são conservadoramente incertos; flag de exceção/feriado também torna
incerto. Não há calendário completo de feriados municipais ou exceções de cada
unidade: status pelo cadastro não é garantia em datas locais não catalogadas.
Não se presume programação especial de feriado, mesmo para 24h.

## Links e Uber

No app, aliases React seguros: Ver no Wellhub, Abrir mapa, Mais detalhes; fontes
Wellhub exigem HTTPS, domínio exato, caminho do diretório, sem userinfo/porta.
Texto do CrewCierge permanece escapado pelo React; alias nunca usa HTML bruto.
Bots continuam texto simples/URLs explícitas: fluxo de resposta atual fornece
string, sem entidades/teclado por unidade; não fingimos Markdown universal ou
alias interativo em WhatsApp/Telegram. Nenhum encurtador/serviço novo.

Documentação oficial Uber consultada em 2026-10-10:
https://developer.uber.com/docs/riders/ride-requests/tutorials/deep-links/introduction
A documentação diz que endereço de exibição não substitui latitude/longitude.
Não há coordenadas verificadas das academias ou client_id de integração neste
catálogo; nenhum foi inventado/coletado. Portanto "Abrir Uber · informar destino"
abre somente https://m.uber.com/ por ação explícita do usuário, com title informando
que destino não foi preenchido. O endereço continua disponível no cartão; o
usuário informa destino, confere preço e confirma na Uber. Não é "corrida pedida"
nem destino automático comprovado. Não envia localização privada, não reserva,
não consulta preço/API paga, não cria credencial/permissão. Deep link de destino
fica limitado por coordenadas/integração ausentes, em vez de fingir suporte.

## Testes

Mocks de relógio: sábado/domingo, 24h, meia-noite, pausa, limites, fusos diferentes,
dias ausentes, feriado/exceção, datas inválidas/futuras/vencidas; execução TZ=UTC
e Asia/Tokyo; timer minuto/foco/visibilidade/cleanup. API cidade/plano antes da
ordem; formatter CrewCierge no sábado à noite e feriado. Regressões da PR986
com DF Treino de força/Cycle e limites3900/4000/1500/1000/800/600 executam payloads
Telegram/WhatsApp fictícios: novas linhas de status não cortam blocos/URLs/avisos.
19 conversas e13planos raw/materializados, fonte/GPS/Fortaleza/DF, build/TypeScript.

Draft para revisão independente. Sem merge/deploy, envio real, coletor, mudança
de permissões, notificações, Play ou AIMS. A publicação anterior não prova esta
nova proposta em produção.

Capturas mobile sintéticas do renderer preparado:

- [Claro, normal](evidence/wellhub-hours/cards-light-390-1.png)
- [Claro, fonte 150%](evidence/wellhub-hours/cards-light-390-1.5.png)
- [Escuro, normal](evidence/wellhub-hours/cards-dark-390-1.png)
- [Escuro, fonte 150%](evidence/wellhub-hours/cards-dark-390-1.5.png)

Nota: os feriados/dias de possível exceção listados são uma proteção conservadora,
não cadastro legal completo de feriados. Interfaces não usam essa lista para
confirmar abertura especial; datas locais fora da lista continuam dependentes
de confirmação direta na unidade/Wellhub, conforme aviso do catálogo.

Os cartões mostram o plano mínimo pelo cadastro e oferecem "Condições de acesso"
expansível para preservar a nota integral sem crescer permanentemente. A fixture
abre condições de agendamento e confirma que o parágrafo expandido fica antes
das ações, sem sobreposição. Mais detalhes conserva a fonte/datamento e as notas
já existentes do detalhe da unidade. Não há confirmação de acesso atual.

Revisão independente encontrou dois falsos verdes no cd5cbd03: faixa adicional
conflitante com 24h e overnight após 12/out herdado do feriado. Correção exige
que todas as faixas 24h concordem e cubram sete dias; faixa overnight carrega
a incerteza do feriado da data local de origem. Reprodutores e controles
positivos (24h dividido/coerente, overnight comum) acrescentados. O pacote
Library do cd5cbd03 é histórico e não é alvo de aprovação após a correção.


### Follow-up da revisão visual
O bloco de plano/condições ocupa toda a largura, sem herdar as colunas genéricas
dos filhos do cartão. Palavras comuns usam quebra entre palavras, evitando
“cadast/ro”. O painel Mais detalhes agora contém expansor com plano mínimo,
data da verificação, link da fonte oficial e condições/notas completas.
A fixture extrai também esse painel da Home materializada. Em cada combinação
320/390/768, fonte 100%/150%, claro/escuro, gera `card-whole-*`,
`card-expanded-*` e `detail-expanded-*`. As capturas de elemento incluem sua
altura inteira; a altura do viewport aumenta temporariamente para conter o elemento inteiro; barras sintéticas e sobreposições decorativas são ocultadas e limites de overflow/altura dos ancestrais são liberados somente nessas capturas para
não cobrir o conteúdo. As capturas de viewport e as verificações de alcance
continuam com barras fixas visíveis. Não são imagens privadas nem uma sessão
real autenticada do app.
