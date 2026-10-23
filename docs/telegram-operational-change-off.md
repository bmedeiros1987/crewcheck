# Portão/status Telegram — composição OFF para revisão

Base: c963094bd044a9e5a772eee890c04b65412dd84f (#1215 publicada OFF). Nenhuma ativação ou entrega física. Sem novo scheduler, fila, polling, custo, credencial, migração ou fonte paga. NOTAM continua fora do escopo; nenhum endpoint de diagnóstico upstream foi chamado.

## Ownership e reuso

O owner da frente de evidências de portão confirmou ausência de writer/hunks pendentes e indicou #1191/#1179 já integradas. Esta composição importa `inspectGateSourceHistory` da main e reutiliza seu contrato custom existente, baseline/mudança/frescor/ocorrência. Não altera esse leitor, `gate-source-update`, evidência Radar, Web Push, bootstrap/server.mjs, Infobip, Home/financeiro, IA ou mobile. Os drafts históricos não são incorporados.

A derivação do evento mantém as dimensões de gateCandidateEnvelope: escopo admitido + valor novo + instante da fonte. Para Telegram, conta e vínculo privado substituem a autoridade por instalação; o envelope Web Push não é autoridade Telegram. Revisar consentimento ou reimportar baseline não rearma o mesmo evento. A revisão completa de fonte é também revalidada no dispatch, com cancelamento conservador se houver alteração.

## Caminho composto

O scheduler existente chama o produtor OFF, antes de consumir a mesma crewcheck_notification_jobs. O namespace `operational-change:` é reservado contra enqueue público, inclusive variações de caixa. Jobs desse namespace passam pelo novo validador no dispatcher existente, sem fallback para texto genérico. Constante literal falsa e leitor padrão null impedem produção/envio; nenhuma env ativa este código.

A autoridade de conta/sessão/vínculo, transação e estado é reutilizada diretamente do módulo de briefing, sem copiar uma autenticação. Consentimento é próprio por conta encarnada, assunto gate/status e canal Telegram, com confirmação explícita e CAS de revisão. GET retorna revisão e distingue registro de preferência de agendamento; não acessa fonte externa. Leitura e revogação continuam disponíveis sem vínculo ou escala. Não existe UI de adesão nova neste draft; antes de ativação, deve ser composta no menu Concierge, sem preferências duplicadas.

O callback `readSource(connection, context, {lockSource:true, now})` é exclusivamente server-side e não recebe autoridade do HTTP/job. Deve retornar `{scope:{ownerId,rosterRevision,identity},source:{ownerId,rosterRevision,observation,previousObservation}}` comprovados pela escala canônica ativa e histórico autorizado. Deve fazer leituras atuais completas sob lock na mesma transação (não apenas bloquear IDs e depois ler snapshot). O default null continua ausente: este draft NÃO fornece integração real de histórico nem polling disfarçado. Os testes SQL usam um leitor de estado estritamente sintético que toma FOR UPDATE, não uma integração operacional.

O contrato de portão é exatamente o custom departureGateUpdate existente. Status exige prova independente `departureStatusUpdate` com schema `crewcheck.departure-status-update.v1`, estado canônico, instante próprio, voo/rota/partida exatos; status genérico, cache/receipt/updated não autorizam evento. Este é um contrato de dados proposto, sem afirmar que qualquer fornecedor atual o emita; nenhum adapter Radar/fornecedor o fabrica ou relabela. Estados aceitos nesta proposta: scheduled, boarding, delayed, departed, cancelled, diverted, arrived. Sem esse contrato a fonte de status é bloqueada.

Ambos exigem observações anterior e atual válidas, até 30 minutos, relógios fonte <= recebimento <= agora, sequência temporal, janela da ocorrência e ausência de conflito. Primeira observação não é mudança. Adesão não faz backfill. O producer deriva chave determinística e não altera qualquer job já existente, inclusive cancelado/uncertain. O dispatcher relê fonte, revisão, conta, vínculo e consentimento sob locks, deriva evento e texto novamente e faz CAS processing→dispatching. Valida prazo também após commit antes de chamar transporte. Commit/aceite/gravação incertos não são reenviados automaticamente. Revogação depois do cutoff não recolhe mensagem já aceita.

## Validação e limites

Suíte nova sintética usa o dispatcher real e transporte falso; abrange OFF, CAS, fonte/revisão/valor/vínculo/conta alterados, revogação sem vínculo, assunto separado, baseline/replay, expiração após commit, resultado incerto e namespace forjado. Suítes anteriores de briefing/fila/heartbeat continuam exigidas. Fixtures não provam lock SQL nem recebimento físico.

Workflow existente inclui testes raw/prepared e MySQL isolado `--network none`, socket e banco QA fixos, sem DATABASE_URL/TCP/produção. O novo SQL exercita dois grants, oito planners, dispatch concorrente, dedupe e writer commitando fonte durante espera no owner lock sob REPEATABLE READ. Contraprova remove current-read somente no leitor sintético e exige falha CHANGE_STALE_SOURCE_RACE; execução corrigida usa FOR UPDATE. MySQL não disponível localmente: resultado só pode ser afirmado após CI, que permanece gate de integração. Nenhuma alteração de isolamento global/produção.

## Passos específicos antes de ativação

1. Revisar este draft e completar CI/MySQL raw/prepared e revisão independente no HEAD exato; manter OFF.
2. Identificar um histórico persistido e autorizado que avance sem o app e sem query paga. Verificar owner, escala/ocorrência, revisão, proveniência por campo, mecanismo de atualização e direito de uso. O usuário precisa indicar/autorizar essa fonte concreta se ainda não existir; uma autorização genérica de Telegram não a substitui.
3. Implementar e revisar esse leitor na transação, com contraprovas SQL concorrentes da implementação real. Para status, obter contrato de observação por campo do provedor; não adaptar timestamp genérico.
4. Compor opt-in/revogação no menu Concierge e mostrar fonte indisponível versus preferência salva versus agendamento real. O próprio usuário deve confirmar separadamente Portão e/ou Status para seu vínculo privado atual. Nenhuma preferência real é definida por esta tarefa.
5. Revisar enablement limitado a destinatário/ocorrência/janela e orçamento explícitos; verificar schema e configuração existentes sem criar credenciais/permissões. Depois de autorização específica de teste de envio, observar aceite do Telegram e recebimento físico separadamente. Nunca resetar intent ambíguo.

Web Push permanece disabled conforme diagnóstico anterior; sua instalação/assinatura e configuração real continuam não observadas. Habilitar Push não ativa este produtor Telegram nem valida fonte/status.
