# Contato central da Escala

Base de revisão: `9ca09ff276f3c4f7fa144a52e1977aa0b3c54dc8`.

O usuário pediu somente um ícone de telefone com nome acessível **Escala**, sem número visível no cartão, abrindo o discador. O valor inicial é a string `01141746343`, exatamente como solicitado. Não houve chamada para verificar o número; a origem é a instrução do usuário. O editor administrativo mostra o número para permitir sua alteração.

## Escopo e autoridade

- Um contato global desta instalação, na chave fixa `system:escala-contact:v1` da tabela existente `crewcheck_telegram_state`. Não é um cadastro genérico, registro por conta, workspace ou seleção por companhia.
- Leitura autenticada em `GET /api/operational/escala-contact`. O editor usa `GET /api/admin/escala-contact`; alteração somente por `PUT` nessa rota administrativa.
- Reutiliza `requireExistingIdentity`: JWT e perfil existente com mesmo `public_id`; não cria perfil em consulta. Visitantes/guests são recusados. Administração exige a política já usada em partnerAccounts: claim administrativo assinado **e** email na allowlist atual do servidor. O estado local do app, um plano pago ou campos enviados no body não concedem autoridade.
- Na gravação, perfil e contato são relidos sob locks da transação, com revisão esperada. Conta removida/substituída ou administrador removido da allowlist não conclui a alteração. Concorrência gera conflito; não existe blind upsert ou retry automático.
- GET sem linha retorna o default sem seed. Erro de banco ou JSON persistido inválido retorna indisponibilidade, nunca um falso default. A resposta contém somente o contato tipado; nenhuma outra chave, email administrativo ou segredo.
- O telefone é uma string de dígitos, opcionalmente com `+` inicial, com limite explícito de formato. Não aceita URI, espaços, ramal, pausa, `*`, `#`, parâmetros ou caracteres de controle. Trata-se de segurança sintática, não prova de titularidade ou discagem bem-sucedida.

## Interface

`PublishedSequenceCard` recebe o ícone. `AdminControlCenter` recebe o editor. Essas superfícies já são montadas pela preparação existente; não há alterações em Home, parser ou Android. O handler existente `handleV14316ControlRoute` encaminha apenas as duas rotas antes de entrar nos handlers antigos, sem chamar `ensureTables`.

A leitura usa `no-store` e o cartão atualiza ao entrar/retornar à tela; uma mudança posterior no servidor não requer nova versão do app. Falha não restaura silenciosamente um telefone antigo/default. Respostas antigas, outra conta ou substituição de token não reativam o link ou editor. Uma gravação de sessão anterior não mantém a nova sessão bloqueada e seu `finally` não libera uma gravação mais nova.

O ACK de alteração precisa corresponder ao telefone e à revisão seguinte. Falha/resultado incerto exige recarregar antes de tentar outra gravação; a recarga não repete o PUT. Cancelar edição não grava nada.

O link `tel:` usa o caminho nativo já existente (`ACTION_VIEW`), que abre o discador preenchido. A chamada depende da ação do usuário no discador. Não há `ACTION_CALL`, permissão de telefone, Infobip, transporte pago, notificação ou consumo de franquia. O formato local `011...` é preservado e não promete funcionar fora de seu contexto de discagem; não se converte automaticamente para `+55`.

**Fora desta fatia:** aviso de inconsistência da reserva, confirmação de acionamento, vínculo reserva→voo, alteração de horários, cálculo financeiro/regulatório e ativação de qualquer canal pago.

## Validação

O workflow existente `crewcheck-v13-8-validation.yml` executa, antes/depois da preparação, os testes de backend, DOM/browser e MySQL descartável. Não foi criada outra pipeline.

```
node scripts/regression-escala-contact.mjs
node scripts/regression-escala-contact-preparation.mjs
node scripts/regression-escala-contact-dom.mjs
node scripts/regression-escala-contact-browser.mjs
# Após preparação canônica:
node scripts/regression-escala-contact-preparation.mjs --prepared
# Somente no socket/banco descartável do job notification-mysql:
node scripts/regression-escala-contact-mysql.mjs
```

O teste de preparação também executa o preparador real `v14318/hardening.mjs` em filesystem em memória, verificando que ele preserva as integrações novas. Isso é prova estreita do gerador relevante, não substitui preparação completa.

Na proposta local: 21 grupos backend passaram; React/auth-client real em DOM passou, incluindo GET antigo, conta/token substituídos, PUT pendente, ACK inválido e commit incerto. TypeScript estrito focado passou. Duas falhas de UI encontradas por revisão independente foram corrigidas com contraprovas; oito mutações deliberadas do backend são detectadas. Nenhuma chamada ou rede real foi realizada.

Limites locais: Chromium não iniciou por restrição de socket do sandbox; não foi solicitada ampliação de acesso. Teste MySQL recusou corretamente execução sem o socket descartável; seus 11 grupos SQL ainda dependem do CI. Preparação completa, build agregado, browser real e aceitação no aparelho não foram executados na cópia esparsa. Não tratar esta proposta como pronta para merge antes de revisão e CI do commit exato.

## Acesso pelo Concierge

O cabeçalho da tela Concierge reutiliza `EscalaContactButton`, além do cartão
operacional já existente. O ícone fica disponível mesmo sem sequência publicada,
sem depender de vínculo Telegram/WhatsApp. O contato continua vindo da mesma
leitura autenticada; não há número duplicado, fallback offline novo, comando ao
bot, alteração de canais ou chamada automática. `011` permanece literal.

A mudança de posição não ativa telefonia no Telegram/WhatsApp. O discador depende
do suporte do dispositivo ao link `tel:` e da ação explícita do usuário.

As suítes DOM/browser do contato agora compilam o JSX real do cabeçalho extraído
de Home, usando o componente e cliente de autenticação reais e transporte mock.
Não montam os efeitos de sincronização/status de toda a tela. O browser inclui
320/390px, claro/escuro, texto 200%, alvo mínimo44px e foco; a preparação estreita
confere ambos os locais. Isso não substitui QA do app completo/aparelho.
