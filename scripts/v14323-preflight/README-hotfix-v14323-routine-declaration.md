# Regressão do preflight v14.3.23

Este hotfix cobre variações semanticamente equivalentes da declaração de `conciergeRoutineReply`, incluindo `async`, espaços e valor padrão de `snapshot`.

A normalização só é aplicada quando, entre a abertura da função e `const next = conciergeNextProgram(snapshot?.roster);`, existem apenas espaços ou comentários. Qualquer lógica executável intermediária mantém falha obrigatória.
