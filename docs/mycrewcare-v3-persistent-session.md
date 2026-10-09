# MyCrewCare v3 — fundação persistente, isolada e local-first

Status: **DRAFT desconectado, sem ativação, login real, deploy ou publicação**.

Esta entrega prepara a base para o comportamento aprovado — conectar uma vez, conservar a sessão no aparelho quando o provedor permitir e manter hotel/pickup disponíveis com procedência e idade — sem ativar acesso ao portal corporativo antes da validação do contrato real.

## O que foi implementado

### Fatos logísticos separados

`shared/myCrewCareLogistics.mjs` representa hotel e pickup como fatos diferentes. Cada fato contém fonte, estado publicado/alterado/cancelado, `stayId`, `rosterEventId`, revisão da escala, instante de observação e fingerprint de conteúdo.

A associação exige conta, escala/revisão, aeroporto, pairing, fuso, limites temporais e uma única estadia candidata. Sobreposição, registros conflitantes ou qualquer registro válido que não encontre vínculo inequívoco fazem a sincronização falhar fechada. Esses fatos não modificam APZ, apresentação, jornada, repouso, parser, financeiro ou alarmes.

### Sessão local-first

`createMyCrewCarePersistentSession`:

- restaura o último cache válido sem declarar que a sessão está conectada;
- mantém dados verificados durante falha temporária ou ausência de rede;
- distingue `connected`, `cached`, `offline-cache`, `reconnect-required`, `ambiguous-data`, `sync-error`, `off` e `invalid-context`;
- limpa fatos anteriores somente após um vazio verificado;
- invalida callbacks quando conta, escala ou revisão mudam;
- expõe consultas separadas de hotel e pickup;
- registra alterações sem sobrescrever entrada manual nem configurar o CrewCheck Wake.

### Política de atualização

`planMyCrewCareSync` calcula quando atualizar com base na proximidade de pernoite/pickup, erro anterior e disponibilidade de rede.

Uma aquisição que dependa de tela interativa sempre resulta em `defer-to-foreground` quando o app está fechado. `background-sync` só é permitido quando existir transporte não interativo explicitamente autorizado. Esta PR não cria WorkManager nem WebView invisível.

### Isolamento Android por conta

`CrewCheckMyCrewCareProfile` usa múltiplos perfis do AndroidX WebKit. O nome do perfil é derivado do identificador interno por SHA-256, sem expor o valor original. A limpeza é limitada ao perfil escolhido e não utiliza o gerenciador global do WebView.

`CrewCheckMyCrewCareSecureStore` mantém somente o envelope normalizado em cache cifrado AES-GCM com chave do Android Keystore e vínculo criptográfico ao identificador derivado da conta. A validação usa allowlists exatas e distintas para fatos de hotel e pickup, rejeitando chaves extras, tipos inesperados, escopo divergente, horários inválidos e payloads acima dos limites. Testes Android instrumentados continuam como gate antes da ativação.

### Fronteira nativa desativada

`CrewCheckMyCrewCarePortalV3` e `CrewCheckMyCrewCareRuntimeV3` são apenas fronteiras compiláveis. `RELEASE_ENABLED` permanece `false`, `open()` retorna `false` e nada foi ligado a `Home.tsx` ou `MainActivity.java`.

O asset `mycrewcare-transport-v3.js` define um contrato estruturado e sem fallback global, mas não é executado nesta entrega. O futuro adaptador do provedor deverá ser uma proposta separada, revisada e validada fisicamente.

## Limites de ownership

**CrewCheck Mobile Core** é o único owner desta fundação: sessão, perfil, cache, reconciliação, sincronização e futura UI Mobile/PWA.

**CrewCheck Peripherals** deverá consumir somente snapshot normalizado para Wear OS, Watch Face e TV depois da estabilização do contrato.

**Concierge** poderá consumir apenas contexto já resolvido e privado, sem possuir sessão ou matcher paralelo.

A slice não modifica `Home.tsx`, `MainActivity.java`, `scripts/v139/apply.mjs`, servidores, integrações funcionais, parser ou regras de negócio.

## Gates antes de ativar conexão real

- autorização e contrato real de aquisição;
- prova da identidade autenticada do provedor;
- seletores e estados reais documentados, sem fallback genérico;
- SSO/MFA físico, expiração, cancelamento, troca de conta e restauração;
- persistência após fechar o app e reiniciar o aparelho;
- limpeza por conta sem afetar outras sessões;
- testes Android instrumentados de cifragem, corrupção e limpeza do cache;
- dois pernoites na mesma data, sobreposição, virada de mês e fusos;
- vazio, cancelamento, alteração, offline e limitação de requisições;
- wiring e UX finais sob Mobile Core;
- revisão independente e CI do SHA final.

## Validação desta slice

`node --test scripts/regression-mycrewcare-v3.mjs` cobre 12 contratos em UTC, Brasília e Auckland: URL exata, hotel/pickup separados, vínculo sem hotel prévio, ambiguidade, cancelamento, diff, persistência, restauração, cache offline, vazio verificado, troca de revisão, logout e política foreground/background.

`node scripts/assert-mycrewcare-v3-ownership.mjs` protege a lista de arquivos, impede writers compartilhados, exige release desativado, perfil isolado, armazenamento cifrado, allowlists exatas e recusa dinâmica de registros sem vínculo. O workflow executa esses gates antes e depois da preparação canônica, além de TypeScript, Vite e `assembleDebug`.
