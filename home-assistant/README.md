# 🏠 Home Concierge Premium (Home Assistant + Telegram)

Painel premium da casa no bot do Telegram. É um pacote único do Home Assistant:
`packages/home_concierge.yaml`.

## O que muda em relação à versão antiga

| Antes | Agora |
|---|---|
| Cada clique gerava uma mensagem nova no chat ("ativado", "encerrado", "ativado"…) | **Painel vivo**: o clique edita a mesma mensagem e mostra um toast discreto |
| Cliques rápidos ligavam, desligavam e ligavam de novo a faxina | Script em fila (`mode: queued`): `Faxina ON` só liga, `OFF` só desliga |
| Menu fixo de 6 botões | Menu com submenus: Faxina, Luzes, Cenas, Laurinha, Status |
| Faxina só de 3h | **6h** (padrão), 1h, **+1h** somando ao tempo restante, e renovar |
| Fim da faxina sem aviso prévio | Aviso **10 min antes** com botões `➕ Mais 1h` e `⏹️ Encerrar` |
| Status em texto simples | Mostra o tempo que falta, as luzes acesas com o brilho, o que está tocando, o tempo lá fora, as temperaturas, portas e janelas e o nascer/pôr do sol |
| — | **Cenas**: 🏡 Cheguei · 🚪 Saindo · 🍿 Cinema · 🌙 Boa noite |
| — | **🔕 Não perturbe**: silencia os avisos que não são urgentes |
| — | Comandos `/menu` `/casa` `/status` `/faxina` `/luzes` `/cenas` |
| — | Saudação por horário e pelo nome de quem clicou |

## Instalação

1. Em `configuration.yaml`, habilite os pacotes (se ainda não estiver):
   ```yaml
   homeassistant:
     packages: !include_dir_named packages
   ```
2. Copie `packages/home_concierge.yaml` para `/config/packages/`.
3. Edite o bloco **CONFIGURAÇÃO** no início do script `home_concierge`:
   - `luzes`: os `light.*` reais e o nome de cada botão (aceita quantas luzes quiser)
   - `laurinha`: o `media_player` da caixa de som (use `''` para esconder)
   - `clima`, `temperaturas`, `aberturas`: opcionais
4. **Evite IDs duplicados:** se `input_boolean.modo_faxina` ou `timer.modo_faxina`
   já existirem como helpers criados pela interface, apague-os na interface ou
   remova esses blocos do pacote. As automações de luz que respeitam a faxina
   devem continuar checando `input_boolean.modo_faxina`.
5. **Desative a automação antiga do concierge** e as que mandavam as mensagens
   "Modo Faxina ativado/encerrado/renovado". Isso acaba com as mensagens repetidas
   que aparecem no chat hoje.
6. Em *Ferramentas de desenvolvedor → YAML*, clique em **Verificar configuração**
   e depois reinicie o Home Assistant.
7. No Telegram, envie `/menu`.

Requer o Home Assistant 2024.1 ou mais novo, com a integração `telegram_bot`
configurada e o seu chat em `allowed_chat_ids`.

## Vincular o Smart Life (Tuya) ao Home Assistant

A integração oficial **Tuya** do Home Assistant entra com a própria conta do app
Smart Life, via QR code. Não precisa de conta de desenvolvedor Tuya.

1. No celular, abra o **Smart Life** → **Eu** → ⚙️ **Configurações** →
   **Conta e segurança** → copie o **Código de usuário** (User Code).
2. No Home Assistant: **Configurações → Dispositivos e serviços →
   ➕ Adicionar integração → Tuya**.
3. Cole o código de usuário e toque em **Continuar**. O HA mostra um QR code.
4. No Smart Life, toque no **ícone de escanear** (canto superior direito da tela
   inicial), leia o QR code e confirme o login.
5. Todos os aparelhos do Smart Life aparecem no HA com os mesmos nomes do app.
   Lâmpadas viram `light.*`; interruptores e tomadas viram `switch.*`.
6. Veja os `entity_id` em **Configurações → Entidades**. Filtre por "Tuya" e
   coloque as entidades no bloco `luzes` do pacote. Exemplo:
   ```yaml
   luzes:
     light.cozinha: Cozinha
     light.sala: Sala
     switch.abajur_quarto: Abajur   # interruptor Smart Life
   ```

O painel aceita `light.*` e `switch.*`. Na cena Cinema, o brilho de 15% só se
aplica a `light.*`. Um `switch.*` é apenas ligado.

A integração Tuya funciona pela nuvem. Se a internet cair, os aparelhos Smart
Life param de responder ao HA até ela voltar. Para controle 100% local, existe a
integração da comunidade *Tuya Local* (HACS), que dá mais trabalho para
configurar.

## Como funciona

- Todo botão envia `callback_data` com o formato `/hc <ação>`. O prefixo evita
  conflito com outras automações de Telegram que você já tenha.
- A automação `home_concierge_botoes` repassa o clique ao script `home_concierge`.
  O script responde com o toast, executa a ação, espera 1 segundo pelo novo
  estado e **edita** o painel.
- `home_concierge_faxina_sync` mantém o interruptor e o cronômetro coerentes,
  mesmo quando a faxina é ligada pela Alexa, pelo app ou pelo dashboard.
- Você pode chamar o script de qualquer lugar (dashboard, NFC, Alexa):
  ```yaml
  service: script.home_concierge
  data:
    acao: cena boanoite
  ```
  Ações: `nav <menu|faxina|luzes|cenas|musica|status>`, `faxina_on`, `faxina_1h`,
  `faxina_mais`, `faxina_off`, `luz <light.x>`, `luzes_on`, `luzes_off`,
  `cena <cheguei|saindo|cinema|boanoite>`, `musica <play_pause|next|vol_up|vol_down>`, `dnd`.

## Teste offline

```bash
pip install pyyaml jinja2
python3 home-assistant/tests/render_check.py
```

O teste renderiza todas as telas e ações com estados simulados da casa: faxina
ativa, tudo desligado com o "Não perturbe" ligado, e entidades inexistentes. Ele
também valida o formato dos teclados do Telegram e o limite de 64 bytes do
`callback_data`.
