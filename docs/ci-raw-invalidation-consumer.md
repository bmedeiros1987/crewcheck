# Invalidação real em CI descartável

Base diagnosticada: main5269fbcf, sem arquivos da PR1016. A cadeia v139 cold funciona; repeat usa o certificado v2. Uma alteração sintética em server/v1396/infobip.mjs invalida o certificado e faz a cadeia inteira repetir sobre o server já transformado. v1396:64 exige uma integração histórica que materializadores posteriores substituíram. Corrigir esse marcador apenas deslocaria o próximo erro; não resolve a perda da origem raw.

O consumidor restante identificado na PR1016 é scripts/check-cirium-radar-wiring-off.mjs: escreve sobre a árvore preparada e chama scripts/v139/apply.mjs no mesmo diretório. O pacote/runtime também mantém preparação v2, mas sua migração não faz parte desta mudança.

scripts/ci/raw-invalidation-lifecycle.mjs fornece ao consumidor CI um raw extraído do commit Git, revisões sintéticas locais atestadas e gerações preparadas separadas através do adapter já aprovado. prepare retorna generation selada e validation gravável; revise altera somente raw. O consumidor deve executar seus gates na validation e preservar os gates raw/preparado, OFF/fusos e de invalidação/restauração. Não pode passar prepared como origem nem substituir invalidação por um cache hit.

scripts/regression-real-raw-invalidation.mjs executa a cadeia real: cold, repeat, contraprova do replay in-place v1396, alteração raw, preparação com miss, repeat hit, comparação byte a byte com cold independente, restauração raw e novo hit. O experimento descartável executa esse gate nas duas lanes. Os nove arquivos de1016 permanecem intactos: a ligação do seu consumidor ao helper exige mudança posterior nessa frente e revisão;1016 continua OFF/HOLD. Este PR não torna o CI original de1016 verde.

Nenhuma âncora/materializador/runtime/package foi alterada. Mesmos limites do adapter aprovado: código confiável em executor descartável; mesmoUID/chmod e descendentes setsid não constituem isolamento de segurança; sem recuperação automática de lease.
