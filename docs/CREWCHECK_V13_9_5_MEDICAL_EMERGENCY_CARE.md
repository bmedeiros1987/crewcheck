# CrewCheck v13.9.5 — perfil médico e emergência coordenada

## Correção do perfil médico

O módulo agora garante, de forma idempotente, as tabelas necessárias antes de carregar ou salvar o perfil. A resposta de gravação inclui `saved: true`; a interface só confirma o salvamento depois dessa confirmação do servidor.

Tipo sanguíneo, alergias, medicamento contínuo, observações e preferência de plano permanecem cifrados com AES-256-GCM. Use uma `CREWCHECK_DATA_ENCRYPTION_KEY` estável; na ausência dela, o sistema mantém o fallback para `CREWCHECK_AUTH_SECRET` já utilizado pela instalação.

## Emergência no Telegram

1. `/emergencia` exibe os tipos de emergência.
2. O bot oferece o botão nativo para compartilhar a localização ou usar o hotel do pernoite.
3. Após a confirmação, o solicitante recebe a lista nominal de quem recebeu.
4. Cada destinatário recebe **Vou ajudar**, **Contatar tripulante** e **Ver localização**, quando disponíveis.
5. A confirmação de um destinatário volta ao solicitante com opção de contato.
6. **Já estou sendo assistido** encerra a mobilização e avisa todos os destinatários para não se deslocarem.

Bots não capturam GPS silenciosamente. O `request_location` do Telegram exige uma ação do usuário em conversa privada. Uma localização compartilhada recentemente pode ser reutilizada; o hotel cadastrado é o fallback.

## Atendimento aberto

- `/hospitais`: hospitais e pronto-atendimentos marcados como abertos no momento da consulta.
- `/farmacias`: farmácias marcadas como abertas no momento da consulta.
- `/plano S450` ou `/plano S750`: grava a preferência Amil cifrada.
- Emergência médica executa a busca de hospitais automaticamente após o envio do alerta.
- Cada resultado oferece mapa e, quando `UBER_CLIENT_ID` estiver configurado, um universal link do Uber com destino preenchido.

Quando o plano Amil S450/S750 estiver selecionado, hospitais só aparecem quando o nome/região retornado pelo Google coincide conservadoramente com a rede publicada importada. Se cobertura e funcionamento simultâneos não puderem ser confirmados, o bot não inventa um resultado.

`openNow` é um indicador do Google Places no instante da consulta, não garantia de plantão, especialidade, autorização ou cobertura. Em risco imediato, o sistema orienta SAMU 192/serviço local sem atrasar atendimento por causa do plano.

## Hotéis

`/hoteis` consulta apenas `crewcheck_platform_stays`. Não há sugestões externas. O pernoite atual é destacado e o quarto é exibido somente na conversa privada vinculada do próprio usuário.

## Render

Além das variáveis já utilizadas:

```text
GOOGLE_MAPS_SERVER_KEY=Places API (New) habilitada
UBER_CLIENT_ID=client id da aplicação Uber
CREWCHECK_EMERGENCY_ENABLED=true
```

## Validação

```bash
npm run check
npm run build
npm run regression:v13.9.5:medical-emergency
```
