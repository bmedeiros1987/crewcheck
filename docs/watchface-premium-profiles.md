# CrewCheck: opções de mostrador

Camada visual da #837, filha periférica da #836. Não é navegação por páginas do CrewWatch.

## Escolhas preservadas

Signature (hora branca forte/card suave), Flight Deck (hora no acento/card instrumental) e Minimal (hora fina/sem fundo). Ciano, violeta e magenta: nove combinações. Seis slots/providers permanecem nas mesmas posições. Logo neon original sem redesenho ou recoloração.

Trocar visual não cria voo, consentimento, assinatura ou dados. AOD mantém hora fina, data e operação; logo, fundos, saúde, passos, bateria e rotina ficam ocultos. O caminho esperado no Galaxy é manter o dedo no mostrador e escolher Personalizar; rótulos variam pelo editor. Trocar visual não deve perder fontes.

## Reconciliação #836 / #838

Filha sincronizada com #836 sem Home/watchContext; esses arquivos foram transferidos para Mobile Core/#824.

As correções de especificação da #838 foram incorporadas sem seu layout alternativo: Variant antes de Font em TimeText; data via um PartText compartilhado, com DAY_OF_WEEK_S, DAY_Z e MONTH_S. A geometria circular conservadora da #837 foi preservada.

O XSD oficial também identificou dois defeitos dos perfis: ListOption aceita apenas um filho (agora um Group sem transformação), e Text do WFF v1 não aceita isAutoSize. O atributo foi removido; fontes nominais legíveis, ellipsis e limite de linhas permanecem. **Não prometer redução automática para 12px nesta versão.** Testar truncamento/strings longas fisicamente; não elevar a versão WFF silenciosamente.

Miniatura do seletor da proposta #838 não foi incorporada: deve representar os perfis finais, não um layout diferente. Está pendente com Peripherals.

## Validação

`node scripts/regression-watchface-premium-layout.mjs`: nove combinações, círculo/colisões, providers/tipos, regras ativo/AOD, PNG/hash, editor, contraste nominal dos acentos e casos negativos de texto/calendário/ordem/grupos.

Workflow `Watch Face WFF v1 specification`: XSD oficial google/watchface@b6cdda0acd3e4c5d0be5624fcdc01209380029d1, antes/depois da preparação; quatro casos negativos do próprio schema. Compilação Android e teste físico continuam separados.

Checklist físico: nove combinações; editar fontes/trocar visual/reiniciar; 12/24h; textos vazios/longos/stale; data no idioma do relógio; AOD sem saúde; sync existente. Sem novas páginas/gestos/permissões/canais.

DRAFT. Sem merge/publicação; CI do HEAD exato e homologação física continuam gates.
