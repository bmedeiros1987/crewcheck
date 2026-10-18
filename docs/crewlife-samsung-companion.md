# CrewLife Companion Samsung

## Objetivo

O CrewLife Companion é um aplicativo Android separado, package `com.crewcheck.life`,
que lê automaticamente no Samsung Health apenas os resumos autorizados pelo usuário e
entrega esses valores localmente ao CrewCheck principal.

Fluxo:

`Samsung Health -> CrewLife Companion -> ContentProvider local/read-only -> CrewCheck Mobile -> CrewWatch`

O CrewCheck principal continua sem Health Connect e sem permissões Android de saúde.

## Dados do MVP automático

Somente leitura:

- Steps
- Sleep
- Activity Summary
- Energy Score

O Companion não solicita no MVP:

- pressão arterial
- glicose
- SpO2
- ECG
- dados médicos
- séries brutas de frequência cardíaca
- localização/rotas

O Energy Score continua identificado como **Energy Score da Samsung**. O CrewCheck não
o renomeia como "aptidão", "fitness for duty" ou diagnóstico.

## Privacidade

O resumo local é criptografado com AES/GCM usando Android Keystore.

O `ContentProvider` é local e somente leitura. O provider valida o UID chamador e aceita
apenas um UID que possua exatamente o package `com.crewcheck.app`; ele não usa uma
permissão Health Connect no app principal e não envia séries brutas ao servidor.

Nenhuma série temporal bruta é enviada ao CrewWatch.

## Baixar o SDK oficial

Baixe o Samsung Health Data SDK v1.1.0 na página oficial Samsung Developer.

Dentro do ZIP, use:

`libs/samsung-health-data-api-<versao>.aar`

Não commitar o AAR no repositório público.

O `.gitignore` em `android-wrapper/lifecompanion/libs` protege esse arquivo.

Hash validado pelo proprietário para o AAR 1.1.0:

`f5d3d83cf00b97d0bb1b1db4da076e861eb1c3e6e704d89a34e68909d2f38654`

## Teste local rápido

No macOS/Linux:

```bash
bash scripts/crewlife-samsung-local-test.sh "$HOME/Downloads/samsung-health-data-sdk-1.1.0.zip"
```

O script:

1. extrai temporariamente o AAR;
2. gera `:lifecompanion:assembleDebug`;
3. informa o caminho do APK;
4. remove o AAR do repositório local ao terminar, salvo se `CREWLIFE_KEEP_AAR=1`.

Depois instale o APK no telefone Android.

## Developer Mode da Samsung

Para leitura de dados em desenvolvimento, use o Developer Mode do Samsung Health Data
SDK no telefone de teste.

Developer Mode é somente para desenvolvimento/teste e não deve ser apresentado como
fluxo de usuário final.

## GitHub Actions com o SDK real

O AAR oficial é maior que o limite de um GitHub Actions Secret e, por ser um binário
de terceiro, não deve ser commitado nem recuperado do histórico público do repositório.

Para build release automatizado, mantenha o AAR em um artifact store **privado** e
configure secrets pequenos:

- `SAMSUNG_HEALTH_DATA_AAR_URL`: URL HTTPS privada/pre-assinada do AAR;
- `SAMSUNG_HEALTH_DATA_AAR_TOKEN`: token Bearer opcional quando o endpoint exigir;
- `SAMSUNG_HEALTH_DATA_AAR_SHA256`: opcional, mas quando configurado deve corresponder ao hash 1.1.0 acima.

O workflow `CrewLife Samsung companion`:

- sempre valida arquitetura, TypeScript e build debug;
- nunca lê o SDK de commits, branches, tags ou qualquer outro caminho do Git;
- sem `SAMSUNG_HEALTH_DATA_AAR_URL`, fica em modo architecture-only e não produz build Samsung-enabled;
- quando a URL privada existe, baixa temporariamente o AAR somente via HTTPS;
- valida sempre o SHA-256 fixado do SDK 1.1.0 antes do build release;
- gera APK e AAB release assinados somente após o pin de integridade;
- verifica a assinatura;
- apaga o AAR ao final.

Para teste físico local, o helper acima usa o ZIP oficial baixado diretamente da Samsung.
Para CI Samsung-enabled, a única fonte aceita é o artifact store privado configurado.

## Parceria Samsung para distribuição

Antes de distribuir o Companion aos usuários, enviar Partnership Request para Samsung
Health Data SDK.

Dados planejados:

- package: `com.crewcheck.life`
- finalidade: wellness/quality-of-life companion
- acesso: read-only
- tipos: Steps, Sleep, Activity Summary, Energy Score
- assinatura: usar o SHA-256 da chave oficial do CrewCheck Companion

Enquanto a parceria não estiver aprovada, o aplicativo deve ser tratado como piloto de
desenvolvimento.

## Separação de responsabilidade

CrewLife é assistente de bem-estar e rotina.

Ele não:

- determina aptidão para voo;
- libera ou bloqueia atividade operacional;
- substitui canal oficial de fadiga;
- faz diagnóstico;
- prescreve tratamento.

A escala canônica continua sendo responsabilidade do CrewCheck principal.

## Validade por métrica e compatibilidade (candidato, sem ativação)

`generatedAtEpochMs` é a hora da consulta, nunca prova da idade da medição. O
contrato local v1 ganha metadados aditivos `metricValidity` e `validUntilEpochMs`:

- Steps/Activity Summary representam a janela diária consultada no fuso da consulta;
  a validade termina no primeiro entre fim desse dia e seis horas após a consulta.
  Não se afirma que houve amostra nova no fim da janela.
- Energy Score só é atual quando `energyDate` corresponde ao dia atual no
  `energyZoneId` fornecido pela fonte (offset/zona, quando disponível). Sete dias
  de busca não são sete dias de validade. Sem fuso comprovável, fica sem dado.
- Sono mantém `sleepStartLocal`/`sleepEndLocal` para a representação local original;
  esses valores nunca recebem o fuso atual por inferência. Instant/OffsetDateTime
  fornecido pelo adaptador é preservado em `sleepStartInstant`/`sleepEndInstant` e
  nos campos antigos. Sono sem fim absoluto não vira medição atual; fim absoluto
  tem limite conservador de 24h, além das seis horas de validade da consulta.
- Valor ausente/inválido/expirado é `null`, não zero. Zero medido continua zero.
  As quatro permissões Samsung são independentes; somente categorias concedidas
  são consultadas. Há nova leitura das concessões antes de exportar o resultado
  e na fronteira do provider; falha em verificar acesso não devolve o cache.

Phone e Companion compartilham o filtro puro. A tela não renova o TTL ao renderizar.
O hint de troca de conta existente serve somente para invalidar consentimento de
espelhamento e resultados pendentes; não autentica a conta Samsung nem vincula
uma pessoa a medições. Na primeira associação do processo há revogação conservadora:
é necessário conceder novamente o espelhamento. Não foi acrescentada permissão.
Não há garantia de cancelamento de um put já aceito pelo Data Layer antes da
revogação; a exclusão/retry existente permanece responsável pela limpeza.

**Limite coordenado com a frente Watch:** o atual `CrewLifeSnapshot` v1 converte
campo omitido em zero internamente. O novo telefone omite métricas sem dado e reduz
o prazo global ao menor prazo das métricas incluídas, mas não altera esse parser.
Distinguir zero/ausente em todas as superfícies Wear exige composição/revisão com
seu proprietário. Telefone antigo também não interpreta os novos metadados; não
se deve afirmar correção ponta a ponta em instalações de versões mistas.

Fixtures executam o adaptador Java reflexivo real contra Samsung/grants/armazenamento
sintéticos; testam ausência/zero, fonte antiga, concessão parcial/revogação, horários
com offset, DST/fusos, parser Wear v1 inalterado e resultado atrasado A/logout/B.
Não fazem chamadas Samsung/Health Connect, coleta de conta/dispositivo ou Data Layer.
Sem o SDK proprietário/aparelho não se comprova quais accessors opcionais a versão
instalada fornece; ausência de accessor falha fechada. Confirmar sono/energia atuais,
revogação e troca de conta no aparelho continua gate físico antes de liberar.
A variante Play principal mantém a exclusão Health Connect em store-policy.

### Correções após revisão independente (mesma PR, HOLD)

O cache web `crewcheck:life:*` usa envelope local com proprietário e schema 2;
entradas anteriores sem proprietário são descartadas, sem migração para a conta
atual. `authClient` invalida esses caches e o resumo em memória na fronteira global
de sessão e em mudanças de autenticação entre abas, mesmo com Life desmontado.
Leituras verificam proprietário/sessão vigente; callbacks capturam a geração antes
da leitura. Esse owner local é um fence de privacidade, não autenticação Samsung.

`lifeConcierge` conserva os metadados de validade, aplica-os em resumo e histórico
fallback e mantém zero medido. Resumo Samsung substituído/revogado remove versões
Samsung anteriores do histórico, inclusive quando o evento chega sem Life montado.
A preparação canônica preserva esses checks em vez de reescrever o parser legado.

Duração negativa é recusada com `isNegative()` antes de `toMinutes()`, inclusive
menos de um minuto. A escolha do sono mais recente usa `Instant`: 08:00+02:00 é
anterior a 07:30Z. Revogação parcial sanitiza também o cache criptografado persistido;
se a gravação sanitizada falhar, não exporta esse cache e solicita limpeza local.

Fixtures Java e web continuam sem SDK/API/dispositivo real. O gate de ownership
MyCrewCare continua intacto: seu FAIL na PR de saúde exige decisão separada de
composição/ownership; não é tratado como teste de saúde aprovado nem dispensado.
