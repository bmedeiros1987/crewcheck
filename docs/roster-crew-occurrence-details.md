# Tripulações por ocorrência publicada

A tabela Tripulações/crew list alimenta somente a ocorrência inequívoca data civil + número completo do voo. Não há fallback por voo entre datas nem por todas as etapas do dia. Data ausente, civil inválida, divergente da fonte AIMS ou mais de uma ocorrência na mesma data ficam pendentes. Listas idênticas repetidas são idempotentes; listas conflitantes não escolhem a primeira. Datas da fonte não são corrigidas para a grade visual.

Nomes e funções permanecem em FlightLeg.crew; não foi criado outro campo contendo nomes. crewAssociation registra apenas um estado sem dados pessoais. Nomes de uma palavra, cargos repetidos e quebras de linha são preservados; isso não prova identidade, composição operacional ou adicional. Evidências CCM já existentes são preservadas, mas a tabela nova não cria ccmLead/ccmBonusStatus. O consumidor legado de adicional não promove nomes de associação visual a confirmação.

Home preserva sua projeção crew:string[] para consumidores anteriores. Os detalhes leem o FlightLeg já presente no evento, mantendo funções e todos os nomes. FlightCrewDetails é usado em FlightCard/RosterInlineDetails e nos detalhes AIMS/RosterLaunchView da composição canônica. As linhas compactas continuam com acesso de detalhes existente, sem lista de nomes aberta.

PDF.js lê todas as páginas; os parsers recebem o texto completo. A prova sintética usa três páginas e percorre parsePDF, JSON e construção canônica. O armazenamento existente conserva os objetos de cada escala/conta/publicação; não há nova persistência, sync, transmissão ou aprendizado. A remoção recursiva de crew/ccmLead e o apagamento de rawText nos compartilhamentos permanecem no servidor. CalendarExport continua um export explícito do titular; não foi ampliado para visitantes, nem recebeu confirmação automática CCM.

Os anexos pessoais não foram incorporados. Todo PDF, nome, matrícula, voo e screenshot de regressão é sintético. Portão, PS/#1325, #1310, #1292 e a projeção distinta da #893 ficam fora deste delta.

Limite: server/rosterParser.mjs possui outro parser para fallback/Telegram e não lê esta tabela. Este incremento cobre parsePDF local, seus parsers e objetos persistidos; não afirma extração de tripulações pelo fallback do servidor.
