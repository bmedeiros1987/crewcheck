# CrewCheck v13.9.6 — ligações Premium pela Infobip

## O que foi corrigido

O backend agora reconhece `INFOBIP_PHONE_FROM`, que já era documentada pelo projeto, além do alias legado `INFOBIP_FROM`. A seleção do provedor deixa de depender acidentalmente do CallMeBot e o blueprint do Render passa a selecionar `infobip` para a ligação telefônica Premium.

Esta versão também corrige o roteamento do webhook para que os comandos e botões de emergência/hospitais/farmácias/plano entregues na v13.9.5 alcancem o handler correspondente, em vez de caírem na resposta genérica do Concierge.

A integração também aceita:

- `INFOBIP_BASE_URL` com ou sem `https://`;
- `INFOBIP_API_KEY` com ou sem o prefixo `App`;
- números formatados com `+`, espaços, parênteses ou hífen;
- aliases antigos de base URL, chave e caller ID, para não quebrar ambientes existentes.

## Variáveis no Render

Configure no serviço `crewcheck-premium`:

```text
CREWCHECK_WAKEUP_CALL_PROVIDER=infobip
INFOBIP_API_KEY=<API key com acesso ao produto Voice>
INFOBIP_BASE_URL=<subdomínio da conta>.api.infobip.com
INFOBIP_PHONE_FROM=<número/origem Voice com DDI>
INFOBIP_VOICE_LANGUAGE=pt-BR
```

`INFOBIP_FROM` continua aceito como alias de `INFOBIP_PHONE_FROM`. Não é necessário cadastrar os dois.

Depois de salvar as variáveis, faça um novo deploy para que o processo Node leia o ambiente atualizado. Em **Despertador Inteligente**, o administrador verá `Infobip conectado para ligações Premium` ou a lista exata dos nomes ausentes, sem exibição dos valores.

## Teste

Informe o telefone de destino com DDI e use **Testar Infobip Premium**. O sistema diferencia:

- integração incompleta;
- telefone sem DDI ou inválido;
- API key/permissão Voice recusada (`401`/`403`);
- origem ou destino recusado (`400`);
- chamada aceita pela Infobip.

Validação local:

```bash
npm run regression:v13.9.6:infobip-calls
```
