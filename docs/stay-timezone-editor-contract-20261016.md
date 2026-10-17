# Pernoite: fuso de exibição e contrato de integração

Base aprovada: 369e58004beb8ace3d0f04fc339488a67b54755c. Mudança local independente; nenhuma publicação ou atualização de APK.

## Escopo e ownership
Reutiliza timezone-choice, cadastro de aeroportos e store v2 existente. Acrescenta resolução estrita apenas aos novos consumidores; comportamento legado permanece. Arquivos reservados: shared/timezone-choice.{mjs,d.mts}, shared/stay-time-presentation.{mjs,d.mts}, shared/stay-editor-store.mjs, componentes TimezoneChoice, PresentationStayManagerView e StayHotelAlarmPreview, regressões stay-time-presentation e stay-editor-browser e este documento.

Home/materializer/financeiro/Pulse pertencem à frente 01a14131-659f-75b9-a79d-dda202cd301b e não entram no patch. MyCrewCare pertence à frente 01a129e4-f6fa-71e1-b271-e3e5ac9f9014; HEAD de377 não disponível localmente. Nenhum mapa de aeroporto, serviço, infraestrutura ou permissão foi alterado.

## Contrato para Home
PresentationStayManagerView aceita initialStayId e initialFocus: time-zone | emergency-sharing. O segundo parâmetro só rola e focaliza o controle depois da seleção do pernoite; nunca marca, salva ou autoriza. O card e seu encaminhamento ainda precisam ser implementados pelo owner da Home.

## Fonte e exibição
Preferência por conta, no store existente: local (fonte do evento, não GPS), base efetiva do perfil, UTC ou manual IANA pesquisável; restaurar padrão escolhe local. Base ausente não vira Brasília ou dispositivo. Aeroporto conhecido pode sugerir o fuso já revisado; desconhecido exige informação explícita.

Alterar fuso de exibição persiste só essa preferência. Não altera data, instante, fuso da fonte, escolha manual do alarme, cancelamento ou consentimento. Editar o fuso da fonte é outra ação e exige reconfirmar a hora de chegada. Offsets usam o instante do evento. Aviso de conversão aparece somente quando data ou relógio efetivamente diferem, ou quando há dados ausentes/inválidos.

normalizePickupLocal recebe date, clock e timeZone IANA explícitos do local de pickup. Nunca usa preferência, base ou dispositivo para preencher fonte ausente. Datas inválidas e horários inexistentes/ambíguos de DST são rejeitados. presentPickup preserva a fonte e seu instante e considera local como o fuso do pickup, mesmo que o hotel seja outro local. Fonte civil inconsistente com instante é rejeitada.

O adaptador de pickup está entregue como contrato puro; produtores/consumidores reais MyCrewCare não foram conectados neste patch. Eles precisam fornecer a fonte verificada antes de exibir/agendar. O preview converte somente sua apresentação; o cálculo existente e seus dados de origem continuam iguais.

## Compartilhamento
Entrada por foco não concede consentimento. Marcar/desmarcar exige ação explícita e salvar o pernoite. A preferência local permanece revogável; este patch não implementa nem afirma revogação global em servidor. Trocar fuso nunca altera autorização.

## Evidência e limites
39 testes puros passaram em UTC, America/Sao_Paulo e Asia/Tokyo, incluindo isolamento de contas, pickup Manaus, Lisboa por data, virada de dia e gaps/folds de Nova York. Regressão legada de timezone passou. Navegador sintético em 390/1280 verifica modos, reload, horário manual, consentimento explícito e revogação; TypeScript e Vite passaram. Fixture usa armazenamento sintético e bloqueia rede externa; nenhuma notificação real foi enviada.

A imagem Library citada retornou apenas confirmação de ação, sem pixels inspecionáveis; evidência visual não é reivindicada. Revisão usa código e descrição recebida. GitHub Forbidden não foi contornado. Sem publicação, mensagens pagas, novos recursos Aiven/Render ou chamadas a provedores reais. Auditoria aqui é local; disponibilidade de dependências externas não é comprovada.

Permanecem: integração Home e MyCrewCare pelos respectivos owners, teste físico específico autorizado e APK oficial com identidade/assinatura compatíveis. Nome Play 14.4.11 não comprova versionCode nem certificado; upload key não comprova Play App Signing. Não desinstalar nem limpar dados. Evidência Android anterior permanece separada na base; este patch não resolve nem comprova entrega push em app fechado.
