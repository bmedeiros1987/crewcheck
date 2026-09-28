# CrewCheck Guardian / Life ID — saúde, emergência, aparelho perdido e leitura offline

## 1. Objetivo

O CrewCheck Guardian é um módulo opcional do CrewCheck Life para gerar um cartão visual personalizável para a tela de bloqueio do OneDevice per Crew ou dispositivo pessoal. O cartão inclui um QR Code protegido e serve a duas finalidades distintas:

1. auxiliar em uma emergência, exibindo apenas informações previamente autorizadas pelo titular;
2. facilitar a devolução de um aparelho encontrado, sem revelar dados pessoais desnecessários.

O recurso não realiza diagnóstico, não substitui prontuário, não declara aptidão para o trabalho e não deve ser apresentado como serviço médico.

## 2. Princípios de privacidade e LGPD

- ativação exclusivamente opt-in;
- consentimento separado para dados pessoais, dados de saúde e contatos de terceiros;
- finalidade explícita e granular;
- minimização de dados;
- nenhuma publicidade, venda, perfilamento comercial ou comparação entre usuários;
- funcionamento normal do CrewCheck sem ativar o Guardian;
- possibilidade de revisar, exportar, revogar e apagar os dados;
- QR nunca deve conter CPF, documento, endereço residencial ou dados de saúde em texto aberto;
- dados de saúde são sensíveis e exigem tratamento reforçado;
- contato de emergência é opcional;
- cada contato cadastrado deve ter ciência e autorização para ter seus dados utilizados;
- registro de versão do consentimento, data, finalidade e campos autorizados.

## 3. Perfis de compartilhamento

### Privacidade máxima

- nenhuma informação de saúde;
- nenhum nome completo;
- apenas instrução de que o aparelho possui um cartão protegido;
- identificador aleatório do cartão;
- canal de devolução escolhido pelo titular.

### Devolução do aparelho

Pode incluir, conforme autorização:

- primeiro nome ou apelido;
- mensagem “Este aparelho foi encontrado”;
- ligação para contato de devolução;
- WhatsApp do contato de devolução;
- e-mail alternativo;
- contato temporário ou visitante;
- data de validade do contato temporário;
- empresa ou unidade apenas quando autorizado.

### Emergência básica

Pode incluir:

- primeiro nome ou identificação escolhida;
- idioma preferido;
- contato de emergência opcional;
- alergias críticas declaradas;
- condição relevante declarada;
- medicamento essencial declarado;
- instrução curta cadastrada pelo usuário.

### Emergência ampliada

Pode incluir, sempre campo a campo:

- alergias e reações conhecidas;
- medicamentos de uso contínuo;
- dose declarada e horário habitual;
- condição de saúde relevante;
- dispositivo implantado ou equipamento médico;
- restrição alimentar relacionada a saúde;
- contato médico opcional;
- plano de saúde opcional;
- número de identificação do plano apenas se o titular optar;
- tipo sanguíneo somente quando informado e confirmado pelo próprio usuário;
- observações de emergência em texto curto.

O aplicativo deve mostrar aviso de que informações autorrelatadas podem estar incompletas ou desatualizadas.

## 4. Estrutura de dados recomendada

```ts
export type GuardianConsent = {
  enabled: boolean;
  acceptedAt?: string;
  policyVersion?: string;
  purposes: {
    emergency: boolean;
    lostDeviceReturn: boolean;
    offlineReading: boolean;
    healthData: boolean;
    thirdPartyContacts: boolean;
  };
};

export type GuardianContact = {
  id: string;
  label: string;
  name?: string;
  relationship?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  purpose: 'emergency' | 'device-return' | 'both';
  temporary?: boolean;
  validFrom?: string;
  validUntil?: string;
  consentConfirmed: boolean;
  visibleFields: Array<'name' | 'relationship' | 'phone' | 'whatsapp' | 'email'>;
};

export type GuardianMedication = {
  id: string;
  name: string;
  dose?: string;
  schedule?: string;
  purpose?: string;
  critical: boolean;
  emergencyNote?: string;
  lastConfirmedAt?: string;
  visibleOffline: boolean;
};

export type GuardianAllergy = {
  id: string;
  substance: string;
  reaction?: string;
  severity?: 'unknown' | 'mild' | 'moderate' | 'severe';
  emergencyInstruction?: string;
  lastConfirmedAt?: string;
  visibleOffline: boolean;
};

export type GuardianHealthProfile = {
  bloodType?: string;
  bloodTypeConfirmed: boolean;
  conditions: Array<{
    id: string;
    name: string;
    emergencyNote?: string;
    visibleOffline: boolean;
    lastConfirmedAt?: string;
  }>;
  allergies: GuardianAllergy[];
  medications: GuardianMedication[];
  implantsOrDevices?: string[];
  dietaryMedicalRestrictions?: string[];
  healthPlan?: {
    provider?: string;
    memberId?: string;
    supportPhone?: string;
    visibleOfflineFields: string[];
  };
  preferredLanguage?: string;
  accessibilityNeeds?: string[];
  freeTextEmergencyNote?: string;
};

export type GuardianProfile = {
  id: string;
  ownerDisplayName?: string;
  consent: GuardianConsent;
  sharingMode: 'maximum-privacy' | 'device-return' | 'basic-emergency' | 'extended-emergency';
  contacts: GuardianContact[];
  health: GuardianHealthProfile;
  visual: {
    template: 'crewcheck' | 'company' | 'photo' | 'minimal';
    companyLogoAssetId?: string;
    userPhotoAssetId?: string;
    accent?: string;
    message?: string;
  };
  createdAt: string;
  updatedAt: string;
  reviewDueAt?: string;
  revokedAt?: string;
};
```

## 5. Campos de saúde

O cadastro deve aceitar:

- alergias;
- reação conhecida;
- gravidade declarada;
- medicamentos;
- dose;
- horário habitual;
- se o medicamento é crítico em emergência;
- condições relevantes;
- dispositivos ou implantes;
- necessidades de acessibilidade;
- restrições alimentares relacionadas à saúde;
- idioma preferido;
- plano de saúde opcional;
- contato médico opcional;
- tipo sanguíneo opcional e marcado como “informado pelo usuário”.

Nenhum desses campos deve ser obrigatório.

## 6. Contatos

O usuário pode:

- não cadastrar contato;
- cadastrar um ou mais contatos;
- separar contato médico, contato familiar e contato de devolução;
- cadastrar visitante ou acompanhante temporário;
- definir validade do contato temporário;
- escolher quais campos de cada contato aparecem;
- ocultar nome e mostrar apenas “Contato de emergência”;
- permitir somente ligação, somente mensagem ou ambos;
- revogar o contato e regenerar o cartão.

## 7. QR Code e leitura offline

### Regra principal

O QR exibido na tela de bloqueio não deve conter dados pessoais ou de saúde em texto aberto.

### Envelope recomendado

```json
{
  "v": 1,
  "kid": "identificador-da-chave",
  "card": "identificador-aleatorio",
  "mode": "protected-offline",
  "cipher": "AES-256-GCM",
  "payload": "conteudo-criptografado",
  "iv": "vetor-unico",
  "signature": "assinatura-digital",
  "issuedAt": "ISO-8601",
  "expiresAt": "ISO-8601"
}
```

### Limitação criptográfica importante

Leitura offline protegida por qualquer celular é incompatível com privacidade forte: se qualquer aplicativo possuir a chave de descriptografia, essa chave pode ser extraída e usada indevidamente.

Para manter LGPD e leitura offline, adotar um dos modelos:

1. **Enterprise Key** — apenas aparelhos corporativos autorizados recebem uma chave protegida pelo Android Keystore/Apple Secure Enclave e podem ler o cartão offline;
2. **PIN de emergência** — o titular define um PIN separado, entregue a pessoas de confiança; menos adequado para socorristas desconhecidos;
3. **Camada pública mínima + camada protegida** — QR público mostra somente canal de devolução e o conteúdo médico exige CrewCheck autorizado;
4. **Online quando disponível** — leitor solicita autorização e recebe somente os campos necessários; offline permanece restrito aos dispositivos corporativos autorizados.

Para o cenário OneDevice per Crew, o modelo recomendado é Enterprise Key com gestão corporativa e rotação de chaves.

## 8. Segurança técnica

- criptografia autenticada AES-256-GCM;
- assinatura Ed25519 ou ECDSA P-256;
- chaves privadas nunca armazenadas em JavaScript/localStorage;
- Android Keystore para chaves do dispositivo;
- Apple Keychain/Secure Enclave no iOS;
- banco local cifrado;
- biometria/PIN para editar ou visualizar o perfil completo;
- logs nunca devem registrar conteúdo médico;
- telemetria somente agregada e sem conteúdo sensível;
- regenerar QR quando houver alteração crítica;
- expiração configurável;
- revogação local e remota;
- bloqueio de captura de tela nas telas de edição sensível, quando tecnicamente possível;
- limpeza de clipboard;
- proteção contra backup inseguro;
- validação de integridade do pacote;
- indicação “Assinatura válida”, “Expirado” ou “Não verificado”.

## 9. Experiência do usuário

Fluxo de criação:

1. apresentação do Guardian;
2. explicação de privacidade;
3. escolha da finalidade;
4. escolha do nível de compartilhamento;
5. cadastro opcional de contato;
6. cadastro opcional de alergias, condições e medicamentos;
7. revisão campo a campo do que ficará acessível;
8. escolha visual;
9. geração da imagem;
10. instrução para definir como tela de bloqueio;
11. teste de leitura offline;
12. lembrete periódico de revisão.

A tela de revisão deve possuir dois painéis:

- **O que qualquer pessoa vê:** preferencialmente nada além do selo e instrução;
- **O que um leitor CrewCheck autorizado vê:** lista exata dos campos liberados.

## 10. Imagem personalizável

Modelos:

- CrewCheck Premium;
- minimalista;
- companhia, somente com autorização para uso da marca;
- foto do usuário;
- imagem escolhida pelo usuário;
- modo alto contraste;
- tema claro ou escuro.

Elementos opcionais:

- primeiro nome;
- função genérica “Tripulante”;
- selo Guardian;
- mensagem de devolução;
- QR Code;
- indicação “Funciona offline em leitor autorizado”;
- idioma;
- ícone médico sem expor diagnóstico.

A foto e a logo ficam apenas na imagem; não devem ser incorporadas ao payload médico.

## 11. Revisão e validade

- alergias e medicamentos devem apresentar data da última confirmação;
- lembrete de revisão configurável a cada 30, 60, 90 ou 180 dias;
- cartão vencido não deve exibir dados sem aviso explícito;
- alteração de medicamento crítico deve invalidar a imagem anterior;
- contatos temporários expiram automaticamente;
- permitir gerar nova imagem e orientar o usuário a substituir a tela de bloqueio.

## 12. Integração com CrewCheck Life e apps de saúde

Dados provenientes do Health Connect, Samsung Health ou Apple Health não devem ser automaticamente publicados no Guardian.

O Guardian aceita apenas dados conscientemente selecionados e confirmados pelo usuário. Sono, passos, frequência cardíaca, atividade física e métricas de recuperação não pertencem ao cartão de emergência por padrão.

Medicamentos e alergias podem ser importados quando a plataforma permitir, mas precisam de confirmação explícita antes de entrarem no cartão.

## 13. Fases de entrega

### Fase 1

- perfil Guardian;
- consentimentos;
- contatos opcionais e temporários;
- alergias, condições e medicamentos;
- revisão do conteúdo compartilhado;
- geração de imagem;
- QR com identificador e assinatura;
- modo de devolução sem dados médicos;
- armazenamento local protegido.

### Fase 2

- leitor CrewCheck offline;
- criptografia nativa;
- Android Keystore;
- gestão Enterprise Key;
- scanner com validação de assinatura;
- expiração e revogação.

### Fase 3

- Health Connect;
- Apple Health;
- importação assistida de medicamentos/alergias quando suportada;
- administração corporativa sem acesso ao conteúdo médico;
- auditoria de segurança e LGPD;
- testes de penetração.

## 14. Critérios obrigatórios de aceite

- negar consentimento não bloqueia o CrewCheck;
- contato é opcional;
- nenhum dado sensível aparece no QR em texto claro;
- usuário vê exatamente o que será compartilhado;
- dados de terceiros exigem confirmação;
- leitura offline sensível funciona somente em leitor autorizado;
- informações médicas mostram data da última confirmação;
- dados podem ser apagados e cartão revogado;
- cartão expirado é claramente identificado;
- logs e analytics não recebem conteúdo médico;
- experiência funciona em modo avião;
- perfil completo exige autenticação local;
- sistema não apresenta informação como diagnóstico ou garantia médica.
