# Wellhub Brasília/DF — fontes públicas e correção

Consulta: 09/10/2026. Base revalidada: `50e6b73b2ed536e7aee67d7471a96b1a52c36a7b` (main, merge #939).

## Causa verificada

O catálogo carregado pelo servidor continha 19 unidades, todas em SP, sem nenhuma unidade DF. O Concierge aplicava cidade/UF exatas depois da busca, portanto Brasília retornava vazio. A mensagem confundia a ausência de cobertura do snapshot com falta de compatibilidade. A busca usada pela API/UI apenas ordenava localidades, permitindo sugestões fora da área; BSB/DF e regiões administrativas não eram equivalentes reconhecidas.

## Comportamento corrigido

15 unidades DF identificadas por fonte pública oficial individual, endereço e data. No plano Silver+, sem modalidade específica, 13 unidades têm mínimo cumulativamente incluído no snapshot; Bodytech Sudoeste permanece com acesso condicional não confirmado e Corpo e Saúde Águas Claras tem plano desconhecido por versões divergentes. Não se deduz plano pela rede. Silver+ inclui todos os níveis inferiores na taxonomia já existente. Atividade com regra verificada usa seu próprio mínimo; menção genérica de atividade não prova seu tier.

Fonte ausente, data inválida/futura ou snapshot com mais de 90 dias produzem estado desconhecido, nunca incompatibilidade. Falha da leitura live preserva opção local com aviso de acesso/modalidade não confirmados e link oficial. Rotina automática aceita somente acesso incluído, sem condições não resolvidas. Sem cidade/UF, não há sugestões. Não se calcula distância, rota ou lotação neste patch. Brasília/BSB/DF consultam DF; região administrativa solicitada restringe a região. UF contraditória fecha a busca.

## Registros incorporados

| Unidade | Região | Mínimo público | Endereço publicado | Fonte |
|---|---|---|---|---|
| Estação Saúde Academia - Taguatinga Sul | Taguatinga Sul | basic-plus | Av. Comercial - St. A Sul QSA 2 - Taguatinga, Brasília - DF, 72015-020, Brasil | [Wellhub](https://wellhub.com/pt-br/search/partners/estacao-saude-academia-taguatinga-sul-setor-a-sul-brasilia/) |
| Corpo e Saúde - Guará II | Guará II | basic | Edifício Consei - Sria II Qe 34 Eq 32/34 Qi 31 Conjunto S, 33 - Guará, Brasília - DF, 71065-315, Brasil | [Wellhub](https://wellhub.com/pt-br/search/partners/corpo-e-saude-guara-ii/) |
| Corpo e Saúde - Águas Claras Acácias | Águas Claras | basic | Alameda das Acácias, 1 - Q. 107 - Águas Claras, Brasília - DF, 71928-720, Brasil | [Wellhub](https://wellhub.com/pt-br/search/partners/corpo-e-saude-aguas-claras-acacias-aguas-claras/) |
| Corpo E Saúde - Águas Claras | Águas Claras | Não confirmado (versões Basic/Basic+ divergentes) | 162 - Q. 301 - Águas Claras, Brasília - DF, 71930-000, Brasil | [Wellhub](https://wellhub.com/pt-br/search/partners/567719d2-0b12-4484-bb18-c8dab8360630/) |
| Corpo E Saúde - Ceilândia (QNN) | Ceilândia | basic | St. N QNN 7 lote b 41 a - Ceilândia, Brasília - DF, 72225-072, Brasil | [Wellhub](https://wellhub.com/pt-br/search/partners/corpo-e-saude-ceilandia-qnn/) |
| BlueFit - 502 Sul | Asa Sul | silver-plus | SHCS EQS 502/503 - Asa Sul, Brasília - DF, 70330-550, Brasil | [Wellhub](https://wellhub.com/pt-br/search/partners/bluefit-502-sul-asa-sul/) |
| BlueFit - Asa Norte | Asa Norte | silver-plus | 0 - Setor Comercial Norte Q 2 - St. Comercial, Brasília - DF, 70702-908, Brasil | [Wellhub](https://wellhub.com/pt-br/search/partners/bluefit-asa-norte-asa-sul/) |
| BlueFit - Asa Norte 516 | Asa Norte | silver-plus | Carlton Center - Via W2 Norte, 516 - Asa Norte, Brasília - DF, 70770-522, Brasil | [Wellhub](https://wellhub.com/pt-br/search/partners/academia-bluefit-asa-norte-516/) |
| BlueFit 24h - Sudoeste | Sudoeste | silver-plus | Cruzeiro / Sudoeste / Octogonal, Brasília - DF, 70610-480, Brasil | [Wellhub](https://wellhub.com/pt-br/search/partners/academia-bluefit-sudoeste-setor-de-industrias-graficas-brasilia/) |
| BlueFit - Gama | Gama | silver | Sind Qi 2, 1 - Gama, Brasília - DF, 72426-095, Brasil | [Wellhub](https://wellhub.com/pt-br/search/partners/bluefit-gama/) |
| Ultra Academia - Asa Norte | Asa Norte | silver | SHCGN CRN 706/707 Bloco D Loja 36/50 - Asa Norte, Brasília - DF, 70740-640, Brasil | [Wellhub](https://wellhub.com/pt-br/search/partners/ultra-academia-asa-norte-setor-de-habitacoes-coletivas-e-geminadas-norte-brasilia/) |
| Ultra Academia Pátio Brasil | Asa Sul | silver | SCS Q. 7 BL A - Asa Sul, Brasília - DF, 70307-902, Brasil | [Wellhub](https://wellhub.com/pt-br/search/partners/ultra-academia-patio-brasil-asa-sul/) |
| Ultra Academia Noroeste | Noroeste | basic-plus | CRNW 509 Bloco B Lote 2 Ed. Plaza 509 - 1º andar - Setor Noroeste, Brasília - DF, 70688-030, Brasil | [Wellhub](https://wellhub.com/pt-br/search/partners/ultra-academia-noroeste-setor-noroeste/) |
| Academia Gaviões 24h - Gama | Gama | basic-plus | Sind Praça 1 Qi 3 Qi 2 - Gama, Brasília - DF, 72445-010, Brasil | [Wellhub](https://wellhub.com/pt-br/search/partners/TJu24QgLv62vOMLV3CUMUMINu5g_i0uRA4g6ums8wHSvjRETm3rxxX4SRiUZ8hnJ/) |
| Bodytech - Sudoeste | Sudoeste | silver | SQSW 302 Bloco D - Brasília, DF, 70297-400, Brasil | [Wellhub](https://wellhub.com/pt-br/search/partners/bodytech-sudoeste-setor-sudoeste-brasilia/) |

## Condições preservadas

- Ultra Asa Norte: a página oficial reaberta em 2026-10-09 mostra Musculação e Cycle incluídos em Silver. A captura anterior agrupava bike/funcional em Gold. Power Bike e funcional ficam desconhecidos e requerem conferência; Cycle não foi equiparado automaticamente a Power Bike. A unidade exige agendamento para participar das atividades, conforme texto oficial.
- Ultra Pátio Brasil: condicionamento corporal Silver, abdômen e braço Gold. Não oferece confirmação genérica de todas as modalidades.
- Ultra Noroeste: cabeçalho Basic+; balé/cycle/dança/yoga Basic+, musculação/abd Silver.
- Bodytech Sudoeste: cabeçalho Silver acompanhado de Student Plan restrito a 12–25 anos, 10h–16h; atividades indicadas Diamond. Não se infere qual modalidade/condição o usuário satisfaz e não se consulta idade privada.
- Bluefit Sudoeste: o nome contém 24h, mas o horário público consultado é 05h–23h59. Não foi marcado funcionamento contínuo. Endereço mantido conforme fonte, sem número inventado.
- Bluefit Asa Norte: o slug contém Asa Sul, porém o endereço oficial é Setor Comercial Norte; o endereço, identidade e região prevalecem sobre o slug.

## Checagens ainda desconhecidas

[Bluefit Park Sul](https://wellhub.com/pt-br/search/partners/bluefit-park-sul/) foi identificado na pesquisa delegada, mas a consulta pública neste executor falhou; sem endereço confirmado aqui, não entrou no catálogo. [Panobianco — unidades oficiais](https://www.panobiancoacademia.com.br/academias) não estabelece mínimo Wellhub por unidade DF nesta consulta. Fórmula permanece sem unidade DF com página Wellhub comprovada. Essas lacunas não são classificadas como incompatíveis. A resposta vazia aponta para a [busca oficial Wellhub](https://wellhub.com/pt-br/search/).

## Privacidade e validação

Sem login, assinatura, custos, GPS privado, contas reais, mensagens, idade pessoal ou mudanças de proprietário. A persistência de preferências e os filtros de dono permanecem no fluxo existente. Apenas fontes públicas, fixtures sintéticas e testes locais.

A regressão nova cobre matriz completa de planos, nomes/acentos, BSB/DF, regiões e UF contraditória, unidades da mesma rede com mínimos diferentes, desconhecido/condicional/expirado, atividade específica, falta de localização e mensagem honesta. Build e TypeScript locais serão registrados no PR. Revisão independente e CI são gates antes de publicação.

Referência JPEG Library solicitada: materialização pelo helper oficial retornou HTTP 403. Nenhum contorno; pixels não foram acessados.

Duas regressões legadas falharam igualmente no baseline isolado 50e6b73b: conversa Wellhub (17/18; onboarding pendente consome declaração de plano) e v14.4.07 (asserção textual de marcador legado removido pela versão posterior). Não foram mascaradas nem alteradas nesta entrega.

