# Amil S450/S750: confirmação conservadora

Consulta em 09/10/2026. Não foi obtida confirmação oficial atual de uma lista real de hospitais. Nenhum hospital foi inventado ou adicionado ao catálogo.

## Causa verificada

A tela de locais próximos exibia hospitais Maps/manuais junto da seção Amil. O snapshot em `server/data/amil-network-s450-s750.json` usa PDFs de uma corretora, impressos em 2025, e era promovido a `covered: true` sem validade ou produto/rede unívocos. O legado de emergência conciliava nomes parcialmente e aceitava município **ou** UF. O Concierge mais novo também usava hospitais genéricos. Essas informações não comprovam cobertura.

## Fontes oficiais

- [Guia Amil](https://amil.com.br/portal/web/servicos/saude/rede-credenciada/amil/busca-avancada): produto/rede, localidade e atendimento devem ser conferidos no guia. A pesquisa independente reportou 403; não houve login ou contorno.
- [Tutorial oficial de busca](https://institucional.amil.com.br/sites/institucional/files/2023-05/tutorial-busca-de-rede-amil-20230515.pdf): consulta por produto/rede; não se exige CPF/cartão neste patch.
- [Manual do portal](https://institucional.amil.com.br/sites/institucional/files/2024-08/manualportalgestorempresaamilalta.pdf).
- [Lista oficial de produtos de 2024](https://institucional.amil.com.br/sites/institucional/files/2024-03/listaplanosoperadora01032024c.pdf): S450/S750 abreviados não identificam necessariamente variante QP/QC, rede/registro e abrangência. Documento antigo não prova rede hospitalar atual.
- [ANS: acompanhamento de produtos](https://www.gov.br/ans/pt-br/assuntos/operadoras/registro-e-manutencao-de-produtos/registro-e-manutencao-de-operadoras-e-produtos/acompanhamento-de-produtos): vínculo entre produto e prestador; não implica autorização individual.

## Contrato e limites

`confirmed_in_network` exige evidência oficial HTTPS Amil, data de confirmação, produto/rede exatos, identificação/endereço da unidade, serviço e especialidade específicos e município/UF coincidentes. Não existe hierarquia S750 → S450 nem equivalência entre unidades da mesma rede. Apenas negação oficial específica permite `confirmed_excluded`. Ausência/ambiguidade/fonte indisponível/vencida/unidade ou serviço não verificados são `unknown`, fora da lista de compatíveis. Zero resultados não significa ausência de cobertura.

Janela conservadora local: 30 dias; nova consulta falhada não atualiza a data. Não se usa a geração do snapshot para renovar fontes antigas. O contrato de evidência é exercitado somente com fixtures fictícios. O adaptador de API exige os mesmos campos de evidência, sem presumir uma estrutura pública que não foi verificada.

A UI invalida resultados ao mudar plano/variante/rede/serviço/local e rejeita resposta tardia. Hospitais genéricos/manuais e detalhes antigos não aparecem como compatíveis. O Concierge explica a falta de confirmação e liga ao Guia; não consulta Maps para preencher essa ausência. Emergência médica permanece independente: não esperar o filtro; SAMU 192 no Brasil, serviço local fora do Brasil. Não foram enviadas mensagens reais nem lidos dados de contas, GPS, CPF ou carteirinha.

Referência Library `libfile_6a88ebcba558819196129459c4c86ce8`: helper oficial retornou HTTP 403. Pixels não puderam ser inspecionados; nenhum contorno usado.

## Validação

Build canônico e TypeScript PASS. Regressão Amil raw/prepared PASS, incluindo resposta tardia após troca de variante, serviço e conta, confirmação específica S450 e S750 independentes, datas ausentes/futuras/vencidas, nomes vazios, unidades da mesma rede, município homônimo, fallback e visitantes. Revisão independente aprovada. Regressão Wellhub DF PASS. CI do PR é gate antes de publicar.

Transcrição não identificadora fornecida em 09/10/2026: seletor AMIL S450 COPART ADM diverge do resumo Amil S450 QP; Amil S750 COLAB e Amil S750 QP são opções distintas. Local DF/BRASILIA/TODOS OS BAIRROS; serviço PRONTO-SOCORRO 24H parcialmente visível, especialidade PRONTO SOCORRO ADULTO. Nenhum resultado hospitalar foi mostrado. Essas variantes não são equiparadas e nenhum identificador pessoal foi copiado.

## Atualização futura (sem conector ativado)

A integração futura deve consultar apenas a chave produto/rede exatos + município/UF + serviço/especialidade, deduplicar requisições simultâneas e conservar a evidência/proveniência/data original por unidade. Falha ou cache antigo nunca renova validade nem promove candidatos a compatíveis; mudança de chave invalida a projeção. Não foi configurado scraping, agendamento ou endpoint suposto.

Pesquisa preliminar aponta a base nacional [Produtos e Prestadores Hospitalares da ANS](https://dadosabertos.ans.gov.br/FTP/PDA/produtos_e_prestadores_hospitalares/) como possível fonte de candidatos por vínculo plano/estabelecimento, com CNES/CNPJ e datas. Não comprova sozinha a especialidade PS adulto/pediátrico nem resolve as variantes S450/S750. A ingestão, licença/dicionário e mapeamento de produtos exigem avaliação separada; nenhuma base grande foi baixada e nenhum job foi criado. Não é necessário pedir coleta manual de cada estado.
