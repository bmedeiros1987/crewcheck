# Motor regulatório estruturado

## Limites de segurança

O Concierge apenas classifica a intenção em um identificador aceito. O resultado, o alerta, a janela e o cálculo são produzidos por `server/regulatory/engine.mjs`. Intenções sem calculador determinístico retornam `UNSUPPORTED_INTENT`; ausência de perfil, contexto decisivo, regra aplicável ou fonte oficial encerra a consulta sem conclusão.

Cada resposta conclusiva inclui documento, tipo, cláusula/artigo, página, URI/identificador, vigência, rastreio do cálculo e as ações `Ver fonte` e `Mostrar cálculo`. Texto gerado por LLM nunca fornece APZ, repouso, limites, madrugada ou interpretação normativa.

## Perfil temporal

O perfil é uma sequência de períodos, não um estado atual sobrescrito. Empresa, função, base contratual e aeroporto contratual são obrigatórios; frota/grupo também é obrigatório para pilotos. WideBody, NarrowBody e Embraer são valores distintos. Base virtual é opcional e nunca é promovida implicitamente a base contratual. Nenhum período pode se sobrepor para a mesma pessoa.

## Resolução normativa

1. Resolve o perfil vigente na data operacional.
2. Filtra regras pela vigência do documento e pelo escopo de empresa, função, frota/grupo, base e aeroporto.
3. Uma regra imperativa de Lei/RBAC aplicável bloqueia substituição por ACT/CCT.
4. Sem regra imperativa conflitante, ACT aplicável prevalece sobre CCT na mesma matéria.
5. A falta de qualquer fato que mude o ramo do cálculo produz pergunta objetiva e nenhuma conclusão.

O corpus inicial cadastra somente regras conferidas nos PDFs oficiais versionados no repositório: janela de acionamento de HSB (90/150 minutos) e distinção de base virtual, separadamente para pilotos e comissários. Novas regras exigem fonte oficial completa e teste de escopo/vigência.

## HSB acionado

`modelStandbyActivation` preserva o HSB como referência de compliance e liga seu identificador ao acionamento. O voo ou a reserva acionada se torna a referência operacional. Nenhum dos dois registros é apagado ou reclassificado.

## API

`POST /api/regulatory/concierge` recebe `intent`, `at`, `profileHistory` e `facts`. Respostas fail-closed usam HTTP 422 e trazem `code`, `missingFields` e `questions`. O endpoint não aceita texto normativo nem regras fornecidas pelo cliente.

## Evolução do corpus

A migração `20260912_018_structured_regulatory_engine.sql` prepara documentos com hash, regras estruturadas, perfis temporais e trilha imutável de decisões. A carga de documentos deve rejeitar sobreposições, verificar SHA-256 e passar revisão jurídica antes da publicação. Fixtures de parser e oracles existentes não participam desta feature.

