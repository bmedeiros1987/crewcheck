# Tripulações por ocorrência publicada

A tabela Tripulações/crew list alimenta somente a ocorrência inequívoca data civil + número completo do voo. Não há fallback por voo entre datas nem por todas as etapas do dia. Data ausente, civil inválida, divergente da fonte AIMS ou mais de uma ocorrência na mesma data ficam pendentes. Listas idênticas repetidas são idempotentes; listas conflitantes não escolhem a primeira. Datas da fonte não são corrigidas para a grade visual.

Nomes e funções permanecem em FlightLeg.crew; não foi criado outro campo contendo nomes. crewAssociation registra apenas um estado sem dados pessoais. Nomes de uma palavra, cargos repetidos e quebras de linha são preservados; isso não prova identidade, composição operacional ou adicional. Evidências CCM já existentes são preservadas, mas a tabela nova não cria ccmLead/ccmBonusStatus. O consumidor legado de adicional não promove nomes de associação visual a confirmação.

Home preserva sua projeção crew:string[] para consumidores anteriores. Os detalhes leem o FlightLeg já presente no evento, mantendo funções e todos os nomes. FlightCrewDetails é usado em FlightCard/RosterInlineDetails e nos detalhes AIMS/RosterLaunchView da composição canônica. As linhas compactas continuam com acesso de detalhes existente, sem lista de nomes aberta.

PDF.js lê todas as páginas; os parsers recebem o texto completo. A prova sintética usa três páginas e percorre parsePDF, JSON e construção canônica. O armazenamento existente conserva os objetos de cada escala/conta/publicação; não há nova persistência, sync, transmissão ou aprendizado. A remoção recursiva de crew/ccmLead e o apagamento de rawText nos compartilhamentos permanecem no servidor. CalendarExport continua um export explícito do titular; não foi ampliado para visitantes, nem recebeu confirmação automática CCM.

Os anexos pessoais não foram incorporados. Todo PDF, nome, matrícula, voo e screenshot de regressão é sintético. Portão, PS/#1325, #1310, #1292 e a projeção distinta da #893 ficam fora deste delta.

Limite: server/rosterParser.mjs possui outro parser para fallback/Telegram e não lê esta tabela. Este incremento cobre parsePDF local, seus parsers e objetos persistidos; não afirma extração de tripulações pelo fallback do servidor.

P2 date-separator follow-up: AIMS crew records capture slash, hyphen and dotted civil dates consistently with preprocessing, including the next-record boundary. They still require a valid date and exact flight occurrence; no flight-only fallback is restored. Synthetic regressions cover full/short/inferred year, line breaks, adjacent records, invalid dates and the actual PDF-to-app chain.

## CrewTopia leading/wrapped crew table follow-up (synthetic validation)

The PDF.js row geometry can place the crew column before its centered date/flight
line. A narrow horizontal-table reader uses the Tripulações heading, distinct
left date/flight and right crew columns, separated crew paragraphs, and exactly
one enclosed anchor per paragraph. It does not reorder arbitrary extracted text
or choose the nearest flight. Invalid or non-unique geometry withholds the page;
ambiguous dates remain unassociated. A date-first page retains the existing text
contract, but a leading/ambiguous page cannot fall back to that text contract.
Conflicting records across pages remain ambiguous. Members and roles are display
data only: no ccmLead, confirmed chief status or financial entitlement is created.

The old date-first synthetic PDF and the spatial leading-table synthetic PDF both
run through PDF.js/parsePDF, actual import, Home and details. Fixtures contain only
fictitious identities. The private real input was readable as Library-extracted
text, but the official materialization helper failed twice with a network error;
no private PDF bytes or actual PDF.js visual rows were available in this executor.
Therefore this follow-up does not claim an end-to-end test of that real document,
an official LATAM format homologation, or validation of the user's stored import.
