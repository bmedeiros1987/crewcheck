# 🏠 Home Concierge Premium (Home Assistant + Telegram)

Central completa da casa no bot do Telegram. É um pacote único do Home
Assistant: `packages/home_concierge.yaml`.

> ⚠️ **Se o bot ainda mostra "Faxina ON / Faxina OFF / Cozinha / Sala /
> Laurinha / Status"**, é o concierge **antigo**: o pacote novo ainda não foi
> instalado. Siga a [Instalação](#instalação).

## O que ele faz

| Tela | O que tem |
|---|---|
| 🏠 **Painel** | Resumo vivo da casa: luzes acesas, alarme, despertador, faxina, música, clima. Cada clique **edita a mesma mensagem**, sem encher o chat |
| 🛋️ **Cômodos** | Criados **automaticamente** a partir das Áreas do HA. Em cada cômodo: liga/desliga cada aparelho (luz, tomada, ventilador, cortina, ar-condicionado), acende/apaga tudo e brilho 25/50/100%. Mostra a temperatura do cômodo |
| 🛡️ **Alarme** | Armar **ausente / em casa / noite** e **desarmar com confirmação**. Se o alarme disparar, chega um aviso urgente (mesmo com 🔕), com botão para desarmar |
| ⏰ **Despertador** | Horário pelos botões (±15 min, ±1 h, 5h30/6h/6h30/7h), só dias úteis ou todo dia. Na hora, a luz do quarto acende aos poucos, o som toca e chega um "Bom dia" com o tempo e **😴 Soneca 10 min** |
| 🧹 **Faxina** | 6 h (padrão), 1 h, +1 h, renovar, encerrar. Aviso 10 min antes do fim |
| 🎬 **Cenas** | 🏡 Cheguei · 🚪 Saindo (apaga a casa e **arma o alarme**) · 🍿 Cinema · 🌙 Boa noite (apaga a casa, silencia e **arma modo noite**) |
| 🎵 **Laurinha** | Tocar/pausar, próxima, volume |
| 📊 **Status** | Alarme, luzes por cômodo, temperaturas, despertador, faxina, música, clima, portas, sol |
| ⌨️ **Menu fixo** | Grade de botões grandes embaixo do campo de mensagem, como no bot CrewCheck |

```
🛋️ Cômodos      🛡️ Alarme
⏰ Despertador   🧹 Faxina
🎬 Cenas         🎵 Laurinha
🚪 Saindo        🌙 Boa noite
📊 Status        🔕 Não perturbe
🏠 Painel da casa
```

Comandos: `/menu` `/casa` `/start` `/comodos` `/alarme` `/despertador`
`/faxina` `/cenas` `/status` `/ocultar`.

## Instalação

Requer o Home Assistant 2024.1 ou mais novo, com a integração **Telegram bot**
já funcionando (o seu bot atual já usa ela).

1. **Instale um editor de arquivos no HA** (se ainda não tiver):
   *Configurações → Complementos → Loja → **File editor*** → Instalar →
   Iniciar → ative "Mostrar na barra lateral".
2. **Habilite os pacotes.** No File editor, abra `configuration.yaml` e
   confira se existe (adicione se não existir):
   ```yaml
   homeassistant:
     packages: !include_dir_named packages
   ```
3. **Crie o pacote.** No File editor, crie a pasta `packages` (se não existir) e,
   dentro dela, o arquivo `home_concierge.yaml`. Cole nele todo o conteúdo de
   [`packages/home_concierge.yaml`](packages/home_concierge.yaml) (no GitHub,
   botão **Raw** → copiar tudo).
4. **Ajuste o bloco CONFIGURAÇÃO** (no início do script `home_concierge`):
   - `luzes`: suas luzes favoritas (`light.*` ou `switch.*`) e o nome de cada uma
   - `alarme`: o seu `alarm_control_panel.*` (e `alarme_codigo`, se ele pedir código)
   - `despertador_luzes` e `despertador_som`: o que acende e o que toca de manhã
   - `laurinha`, `clima`, `aberturas`: opcionais
   Os nomes das entidades ficam em *Configurações → Entidades*.
5. **Organize os cômodos:** em *Configurações → Áreas*, crie as áreas (Sala,
   Quarto, Cozinha…) e coloque cada aparelho na área certa. A tela 🛋️ Cômodos
   é montada sozinha a partir disso.
6. **Desligue o concierge antigo:** em *Configurações → Automações*, desative a
   automação antiga do Home Concierge e as que mandam "Modo Faxina
   ativado/encerrado/renovado".
7. **Evite IDs duplicados:** se `input_boolean.modo_faxina` ou
   `timer.modo_faxina` já existem como helpers criados pela interface, apague
   esses helpers (o pacote cria os dele com o mesmo nome).
8. *Ferramentas de desenvolvedor → YAML* → **Verificar configuração** →
   **Reiniciar**.
9. No Telegram, envie **`/menu`**.

## Alarme

Funciona com qualquer `alarm_control_panel` do HA: Alarmo, Tuya/Smart Life,
Ring, Intelbras/JFL via integração, etc.

- Desarmar pelo Telegram **sempre pede confirmação**.
- Se o alarme exige código, informe em `alarme_codigo`.
- As cenas mexem no alarme conforme a configuração: `saindo_arma_alarme`,
  `boanoite_arma_alarme` e `cheguei_desarma_alarme` (esta vem desligada, por
  segurança).
- 🚨 Se **qualquer** alarme disparar, chega um aviso urgente com botão de
  desarmar, mesmo com o 🔕 Não perturbe ligado.

Não tem alarme no HA? O jeito mais simples é o **Alarmo** (HACS): ele
transforma sensores de porta/movimento (inclusive Smart Life) num alarme
completo.

## Despertador

- Ajuste o horário pelos botões. Mexer no horário já liga o despertador.
- `📅 Dias úteis` faz ele tocar só de segunda a sexta.
- Na hora: as luzes de `despertador_luzes` (ou os Favoritos) acendem de 0 a
  100% em `despertador_transicao` segundos; `despertador_som` toca
  `despertador_midia` (ou retoma o que estava tocando) no volume
  `despertador_volume`; chega a mensagem de bom dia.
- **😴 Soneca** pausa o som e toca de novo em 10 min. **✅ Acordei** encerra.
- **🧪 Testar agora** executa a rotina na hora.

## Vincular o Smart Life (Tuya) ao Home Assistant

A integração oficial **Tuya** entra com a própria conta do app Smart Life, via
QR code. Não precisa de conta de desenvolvedor.

1. No Smart Life: **Eu** → ⚙️ **Configurações** → **Conta e segurança** →
   copie o **Código de usuário**.
2. No HA: **Configurações → Dispositivos e serviços → ➕ Adicionar integração →
   Tuya**, cole o código e toque em **Continuar**.
3. No Smart Life, toque no **ícone de escanear** (canto superior direito), leia
   o QR code e confirme.
4. Os aparelhos aparecem com os mesmos nomes do app. Coloque cada um na sua
   **Área** e eles surgem sozinhos em 🛋️ Cômodos.

A integração Tuya funciona pela nuvem: sem internet, os aparelhos Smart Life
não respondem ao HA. Para controle 100% local existe o *Tuya Local* (HACS).

## Como funciona

- Todo botão envia `callback_data` no formato `/hc <ação>`. O prefixo evita
  conflito com outras automações de Telegram.
- O script `home_concierge` responde com um toast, executa a ação, espera 1 s
  pelo novo estado e **edita** o painel. Ele roda em fila, então cliques
  rápidos nunca se atropelam.
- Você pode chamar o script de qualquer lugar (dashboard, NFC, Alexa):
  ```yaml
  service: script.home_concierge
  data:
    acao: cena boanoite
  ```
  Ações: `nav <menu|comodos|alarme|despertador|faxina|cenas|musica|status>`,
  `comodo <area>`, `ctog <area> <n>`, `con <area>`, `coff <area>`,
  `cbri <area> <pct>`, `luzes_on`, `luzes_off`, `alarme <away|home|night|disarm>`,
  `desp_toggle`, `desp_uteis`, `desp_adj <min>`, `desp_set <HHMM>`, `despertar`,
  `soneca`, `acordei`, `faxina_on`, `faxina_1h`, `faxina_mais`, `faxina_off`,
  `cena <cheguei|saindo|cinema|boanoite>`,
  `musica <play_pause|next|vol_up|vol_down>`, `dnd`.

## Teste offline

```bash
pip install pyyaml jinja2
python3 home-assistant/tests/render_check.py
```

O teste **simula o script passo a passo** (variáveis, `if`, `choose`, `stop`)
contra um Home Assistant falso com cômodos, alarme, ar-condicionado, cortina e
ventilador, em três cenários (casa completa, alarme disparado com soneca, HA
vazio). Ele confere os serviços chamados em cada ação, o texto de cada tela, o
formato dos teclados do Telegram e o limite de 64 bytes do `callback_data`.
