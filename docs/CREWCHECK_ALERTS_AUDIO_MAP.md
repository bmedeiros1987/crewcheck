# CrewCheck Alerts — audio map v1

Assets derivados das músicas-base CrewCheck e preparados como cues de notificação:

| Cue lógico | Asset Android | Música-base | Uso principal |
|---|---|---|---|
| `signature-soft` | `crewcheck_signature_soft.ogg` | Clear for Flight | informativo, confirmação, mudança não crítica |
| `signature-operational` | `crewcheck_signature_operational.ogg` | CrewCheck Suite | APZ, hora de sair, pickup, portão, reserva/sobreaviso |
| `signature-urgent` | `crewcheck_signature_urgent.ogg` | CrewCheck Theme | mudança crítica de escala, alerta operacional urgente |
| `signature-wake` | `crewcheck_signature_wake.ogg` | Effortless Ascent | despertador / wake-up progressivo |

## Semântica

- APZ/apresentação e decolagem são eventos distintos.
- `signature-operational` pode ser usado em ambos, mas cada notificação deve identificar explicitamente o evento no título/corpo.
- Ausência de APZ nunca autoriza criar uma notificação de apresentação a partir de STD/decolagem.
- A escolha `APZ`, `Decolagem` ou `Ambos` é preferência de visualização; não altera o dado operacional canônico.

## Distribuição

Os arquivos binários devem ser colocados no Android em `android-wrapper/app/src/main/res/raw/` com os nomes acima. A ponte nativa deve mapear o cue lógico para o resource correspondente, mantendo o código de domínio desacoplado do nome físico do arquivo.
