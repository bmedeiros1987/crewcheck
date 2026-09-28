# CrewCheck Guardian — Validação na Fonte e Atestação Digital

## Princípio jurídico e de produto

O CrewCheck não reivindica fé pública, poder certificador estatal, função notarial ou autoridade do órgão emissor. O sistema emite uma **Atestação Digital CrewCheck**, assinada criptograficamente, que declara fatos técnicos efetivamente verificados e registrados pelo sistema.

Texto aprovado para exibição:

> **Atestação Digital CrewCheck**
> O CrewCheck atesta que, na data e hora indicadas, consultou a fonte identificada, recebeu o resultado apresentado e vinculou esse resultado ao documento e ao titular autenticado. A atestação comprova a integridade do registro emitido pelo CrewCheck, sem substituir o documento original, o órgão emissor, a companhia aérea ou eventual conferência obrigatória.

Nunca utilizar nas interfaces ou relatórios:
- “dou fé”;
- “fé pública”;
- “autenticidade absoluta”;
- “documento oficialmente certificado pelo CrewCheck”;
- “posse física garantida em tempo real”.

## Níveis de confiança

1. **Declarado pelo titular** — dado informado manualmente.
2. **Extraído do documento** — OCR/MRZ/QR, sem confirmação externa.
3. **Integridade validada** — assinatura eletrônica ou hash verificado.
4. **Verificado na fonte** — consulta concluída em fonte oficial ou autorizada.
5. **Titular autenticado** — identidade local confirmada por biometria/PIN e vínculo do dispositivo.
6. **Apresentação recente** — documento reapresentado em desafio de posse com data e hora.

Os selos devem ser independentes. “Verificado na fonte” não implica “posse atual”. “Titular autenticado” não implica autenticidade do documento.

## Registro mínimo da atestação

- identificador único da atestação;
- tipo e país do documento;
- identificador mascarado do documento;
- nome normalizado do titular ou hash do nome;
- resultado e campos confirmados pela fonte;
- fonte consultada e método de consulta;
- data e hora UTC;
- validade informada pela fonte;
- hash SHA-256 do arquivo apresentado;
- hash do payload da consulta;
- versão do verificador;
- política de validação aplicada;
- chave pública e identificador da assinatura CrewCheck;
- prazo de validade da atestação;
- status de revogação conhecido;
- evidência de autenticação do titular;
- evidência de apresentação recente, quando realizada.

## Assinatura técnica

- Assinar o payload canônico da atestação no servidor com chave assimétrica protegida por KMS/HSM.
- Utilizar rotação de chaves e publicar JWKS/chaves públicas com `kid`.
- Incluir timestamp confiável e, quando adotado, carimbo do tempo ICP-Brasil.
- QR offline contém somente resumo mínimo, identificador, validade, hashes, assinatura e dados autorizados.
- O leitor CrewCheck valida assinatura, expiração, integridade e última lista de revogação disponível.
- A cópia integral do documento nunca é embutida no QR.

## Validação na fonte

O adaptador de cada documento deve registrar:
- órgão ou infraestrutura consultada;
- endpoint, QR oficial, assinatura digital, MRZ, NFC ou mecanismo utilizado;
- quais campos a fonte realmente confirmou;
- resposta original cifrada ou seu hash, conforme contrato e LGPD;
- código e horário da consulta;
- indisponibilidade, inconclusão ou divergência sem converter falha em aprovação.

Status permitidos:
- `SOURCE_VERIFIED_VALID`;
- `SOURCE_VERIFIED_EXPIRED`;
- `SOURCE_VERIFIED_REVOKED`;
- `SOURCE_MISMATCH`;
- `SOURCE_UNAVAILABLE`;
- `SOURCE_NOT_SUPPORTED`;
- `SIGNATURE_VALID_CONTENT_NOT_SOURCE_VERIFIED`;
- `USER_DECLARED_ONLY`.

## Prova de posse

A posse não pode ser garantida continuamente. O CrewCheck poderá registrar **apresentação recente**, não posse permanente:

1. autenticação biométrica/PIN no aparelho pessoal;
2. desafio aleatório com prazo curto;
3. nova leitura do QR/MRZ/NFC ou captura orientada do documento;
4. comparação com o hash e dados previamente validados;
5. emissão de evidência “apresentado em DD/MM/AAAA HH:mm”.

A interface deve mostrar:

> **Apresentação confirmada há X horas/dias**

Nunca mostrar “documento está em posse agora” sem novo desafio no momento da conferência.

## Conferência operacional pelo chefe de cabine

A tela de conferência deve exibir apenas:
- nome e foto operacional autorizada;
- função;
- documento;
- validade;
- nível de verificação;
- data da última consulta à fonte;
- data da apresentação recente;
- assinatura da atestação;
- alertas de vencimento, divergência ou revogação.

Dados médicos e cópias integrais ficam fora deste perfil de acesso.

## Privacidade e LGPD

- consentimento e finalidade separados para saúde, emergência e documentação operacional;
- minimização dos campos compartilhados;
- controle de acesso por função;
- registro de auditoria;
- retenção definida por categoria;
- exclusão e revogação pelo titular quando legalmente possível;
- criptografia em repouso e trânsito;
- nenhum uso para publicidade ou avaliação discriminatória;
- fonte, data e grau de confiança claramente informados.

## Identidade corporativa

A imagem de bloqueio preserva a marca do empregador, quando autorizada, e apresenta o CrewCheck apenas como tecnologia de verificação. Texto recomendado:

> **Dispositivo corporativo — Tripulação**
> Documentação operacional disponível para conferência pelo leitor CrewCheck.

A imagem não deve exibir validades, dados médicos ou números de documento em texto aberto. Esses dados ficam no payload protegido e na tela autorizada do leitor.
