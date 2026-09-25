# CrewCheck: opções de mostrador

Camada visual da #837, filha da #836. Não é navegação por páginas do CrewWatch.

## Escolhas preservadas

O editor nativo recebe Signature (hora branca forte/card suave), Flight Deck (hora no acento/card instrumental) e Minimal (hora fina/sem fundo). Ciano, violeta e magenta oferecem nove combinações. Os seis slots/providers ficam nas mesmas posições; a logo neon original não foi redesenhada, recolorida ou substituída.

Escolher um visual não cria voo, consentimento, assinatura ou dado. Valores e validade continuam vindo dos provedores existentes. AOD mantém hora fina, data e operação; logo, fundos, saúde, passos, bateria e rotina ficam ocultos.

No Galaxy, o caminho esperado é manter o dedo no mostrador e escolher Personalizar. O texto exato depende do editor. As seis fontes continuam editáveis e não devem ser perdidas ao trocar visual.

## Reconciliação #836 / #838

A filha foi sincronizada com a versão periférica da #836, sem reintroduzir Home/watchContext: esses arquivos pertencem ao Mobile Core/#824.

Da #838 foram absorvidas as correções **de especificação**, não seu layout alternativo: todos os TimeText têm Variant antes de Font, e a data usa um único PartText compartilhado com DAY_OF_WEEK_S, DAY_Z e MONTH_S. O formato EEE dd MMM não volta a ser usado em TimeText. A geometria circular mais conservadora da #837 é preservada.

A miniatura do seletor/renderizador da proposta alternativa #838 não foi incorporada nesta reconciliação: precisará representar os perfis aprovados, não mostrar uma prévia de outro layout. Não afirmar que a miniatura está implementada aqui.

## Verificação

`node scripts/regression-watchface-premium-layout.mjs` verifica as nove combinações, limites circulares e colisões, seis providers/tipos, regras ativo/AOD, PNG original/hash, referências do editor, contraste nominal dos acentos e casos negativos de calendário/ordem WFF.

O workflow `Watch Face WFF v1 specification` valida também o XSD oficial, pinado em google/watchface@b6cdda0acd3e4c5d0be5624fcdc01209380029d1, antes e depois da preparação canônica. Aceitação de schema não substitui compilação Android ou renderer físico.

Checklist físico: alternar os nove visuais/paletas; editar seis fontes e trocar visual; reiniciar; 12/24h; strings longas/vazias/stale; data no idioma do relógio; AOD sem saúde; sincronização existente. Não captura gestos do sistema, não adiciona páginas, permissões ou canais.

DRAFT. Sem merge/publicação; CI do HEAD exato e homologação física continuam obrigatórios.
