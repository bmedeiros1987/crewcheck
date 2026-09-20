# Laurinha Manager

Aplicativo Windows nativo (C puro + Win32) que administra a biblioteca de
músicas e fotos consumida pelo app da TV LG.

O programa **não copia, não converte e não embute mídia em pacote nenhum**.
Ele cataloga arquivos que continuam onde estão e publica um manifesto JSON
(`hub/manifest.json`) com caminhos, playlists, álbuns e as opções do Modo
Quadro. O `.ipk` da LG continua sendo só o app; as músicas e fotos chegam à
TV pelo Hub.

Este diretório **não altera o app LG** em nada.

---

## Build

Requer **Visual Studio Build Tools 2022** com a carga de trabalho
"Desenvolvimento para desktop com C++".

```bat
build.cmd            :: compila Release x64 em build\LaurinhaManager.exe
build.cmd clean      :: remove build\
```

`build.cmd` localiza o toolchain sozinho via `vswhere` e compila com `/W4`,
CRT estático (`/MT`) e `/SUBSYSTEM:WINDOWS`. O executável resultante não
precisa do VC++ Redistributable e não abre console.

Definir `LAURINHA_STRICT=1` acrescenta `/WX` (aviso vira erro). O CI usa esse
modo; o build local fica sem ele de propósito, para que um aviso novo de uma
versão futura do MSVC não impeça você de compilar.

Bibliotecas de link: `comctl32` `shell32` `ole32` (mais `user32`, `gdi32` e
`kernel32`, que são do próprio SDK). Nenhuma dependência externa — sem GDI+,
sem WIC, sem bibliotecas de terceiros.

O workflow `.github/workflows/laurinha-manager-windows.yml` roda esse mesmo
`build.cmd` em `windows-latest` com `LAURINHA_STRICT=1` e confere no binário
gerado o VERSIONINFO, o subsistema GUI e o manifesto DPI. O MSVC compila o
arquivo sem nenhum aviso em `/W4`.

### Arquivos

| Arquivo | Papel |
| --- | --- |
| `LaurinhaManager.c` | Todo o programa (UTF-8 com BOM) |
| `resource.h` | IDs de recurso |
| `LaurinhaManager.rc` | Ícone, manifesto, VERSIONINFO e os 3 diálogos |
| `LaurinhaManager.exe.manifest` | DPI Per-Monitor v2, comctl32 v6, `asInvoker` |
| `laurinha.ico` | Ícone (16/24/32/48/64/128/256) |
| `tools/make_icon.py` | Regenera o `.ico`, sem dependências externas |

---

## Pastas

A raiz da biblioteca é resolvida nesta ordem:

1. `%APPDATA%\LaurinhaManager\root.txt` (gravado ao mudar a raiz em
   Configurações);
2. a variável de ambiente `LAURINHA_HOME`;
3. `%USERPROFILE%\Laurinha` (padrão).

```
<raiz>\
  MINHAS_MUSICAS\            varredura automática de .mp3
  FOTOS_LAURINHA\            varredura automática de imagens
  hub\
    manifest.json            publicado por "Atualizar biblioteca"
    lg-device.json           registro do último ares-install bem-sucedido
  laurinha-manager.json      estado do aplicativo
```

Pastas adicionadas fora da raiz também funcionam: elas entram em
`music.roots` / `photos.roots` e são revarridas a cada atualização.

---

## O que cada página faz

**Música** — adicionar pasta de MP3 ou arquivos avulsos, arrastar e soltar,
criar/renomear/excluir playlists, reordenar faixas (Subir/Descer), remover
faixa da playlist, e o total de faixas sempre visível (biblioteca e playlist
atual).

**Fotos** — adicionar pasta ou fotos avulsas, arrastar e soltar, miniaturas,
criar/renomear/excluir álbuns, ordenar (nome, data ou inverter), definir
capa, e o intervalo de slideshow por álbum.

**Modo Quadro** — tempo por foto, fade, ordem aleatória, legenda, moldura,
fundo e passe-partout, com prévia ao vivo ao lado.

**Status** — LG conectada, Connected Hub, Home Assistant, Música e Fotos.

**Barra inferior** — Adicionar músicas · Adicionar fotos · Atualizar
biblioteca · Abrir Hub · Visualizar TV · Instalar na LG.

"Visualizar TV" abre uma janela em tela cheia que roda o slideshow com
exatamente as mesmas opções do Modo Quadro (setas navegam, Esc sai).

---

## Apagar arquivo original

Remover de uma playlist ou de um álbum **nunca** toca no disco: sai só da
lista.

Remover na visão "Biblioteca completa" / "Todas as fotos" abre uma escolha
explícita de três vias — remover e mandar para a Lixeira, remover mantendo o
arquivo, ou cancelar. A opção que apaga ainda exige uma **segunda**
confirmação, e usa a Lixeira (`FOF_ALLOWUNDO`), nunca exclusão definitiva.

---

## Manifesto do Hub

`hub/manifest.json`, UTF-8 sem BOM, escrito de forma atômica (arquivo
temporário + `ReplaceFile`). `schema` é `laurinha.hub.manifest/1`.

```jsonc
{
  "schema": "laurinha.hub.manifest/1",
  "generator": "Laurinha Manager 5.0.0",
  "generatedAt": "2026-09-20T01:57:46Z",
  "root": "C:\\Users\\voce\\Laurinha",
  "embedMedia": false,                       // sempre false, por contrato
  "folders": { "music": "MINHAS_MUSICAS", "photos": "FOTOS_LAURINHA" },
  "hub": { "url": "http://localhost:8787/" },
  "lg": { "device": "...", "ip": "...", "ipk": "...", "aresInstall": "..." },
  "homeAssistant": {
    "baseUrl": "...",
    "tokenSource": "env:LAURINHA_HA_TOKEN"   // o token nunca é gravado
  },
  "music": {
    "trackCount": 5,
    "roots": ["..."],
    "tracks": [{
      "id": 0, "title": "Ninar",
      "path": "C:\\Users\\voce\\Laurinha\\MINHAS_MUSICAS\\Ninar.mp3",
      "relativePath": "MINHAS_MUSICAS/Ninar.mp3",   // só quando sob a raiz
      "modified": "2026-09-20T01:50:46Z"
    }],
    "playlists": [{ "name": "Dormir", "trackCount": 2, "tracks": [0, 3] }]
  },
  "photos": {
    "photoCount": 6,
    "roots": ["..."],
    "photos": [{ "id": 0, "title": "...", "path": "...", "relativePath": "..." }],
    "albums": [{
      "name": "Álbum 1", "photoCount": 6,
      "cover": 1,                            // id da foto, -1 = automático
      "intervalSeconds": 10,
      "photos": [1, 0, 2, 3, 4, 5]           // a ordem é significativa
    }]
  },
  "frameMode": {
    "secondsPerPhoto": 12, "fade": true, "random": false, "caption": true,
    "frame": "fina-clara", "frameIndex": 1,
    "background": "preto", "backgroundIndex": 0,
    "passepartoutPercent": 6
  },
  "status": { "lg": {...}, "connectedHub": {...}, "homeAssistant": {...},
              "music": {...}, "photos": {...} }
}
```

Os `id` são índices nos respectivos arrays `tracks` / `photos`, e é assim que
playlists, álbuns e capas referenciam as mídias. Reordenar a biblioteca
remapeia todas as referências de uma vez, então os índices permanecem
coerentes dentro de um mesmo documento.

Chaves e valores enumerados (`fina-clara`, `cerejinha-suave`, ...) são
sempre ASCII; só os textos livres (títulos, nomes, `detail`) carregam
acentos.

---

## Status: o que é realmente verificado

As cinco linhas são **verificações locais**. O programa lê arquivos e
variáveis de ambiente desta máquina e **não faz sondagem de rede** — não há
ping, nem socket, nem requisição HTTP. Cada linha diz qual evidência foi
lida:

| Linha | Evidência |
| --- | --- |
| LG conectada | device configurado + data do último `ares-install` em `hub/lg-device.json` |
| Connected Hub | existência e idade de `hub/manifest.json`, e se há alterações não publicadas |
| Home Assistant | URL base configurada + `LAURINHA_HA_TOKEN` presente no ambiente |
| Música / Fotos | contagens e quantos caminhos referenciados sumiram do disco |

Um verde aqui significa "a evidência local confere", não "a TV respondeu
agora". Checagem de rede ao vivo não está implementada.

O token do Home Assistant vem só de `LAURINHA_HA_TOKEN` e nunca é gravado em
disco; o manifesto registra apenas a origem (`tokenSource`).

## Instalar na LG

Precisa do device configurado (`ares-setup-device`) e do caminho do `.ipk`.
O botão executa o CLI oficial da LG em um console separado, espera o término
e registra a data em `hub/lg-device.json` quando o código de saída é 0. O
Modo Desenvolvedor da TV precisa estar ativo. O pacote instalado é só o app —
nenhuma mídia vai dentro dele.

---

## Notas de implementação

- **Unicode**: `UNICODE`/`_UNICODE`, `wWinMain`, APIs `...W` em todo lugar.
  JSON entra e sai em UTF-8, convertido nas bordas.
- **DPI**: Per-Monitor v2 pelo manifesto; `WM_DPICHANGED` recria as fontes e
  refaz o layout. `GetDpiForWindow` é resolvido em tempo de execução, com
  recuo para o DPI do desktop em Windows anteriores ao 10 1607.
- **Miniaturas**: `IShellItemImageFactory` (shell32 + ole32), em uma thread
  separada que trabalha sobre um retrato imutável de `(uid, caminho)` — ela
  nunca toca na biblioteca, que pode ser reordenada ou reduzida enquanto as
  miniaturas são geradas. Provedores que devolvem bitmap degenerado (1x1)
  são tratados como "sem imagem" em vez de virarem um retângulo chapado.
- **JSON**: escritor e leitor próprios, sem dependências. O leitor trata
  escapes `\uXXXX` incluindo pares substitutos, e limita a profundidade.
- **Pintura**: tudo em GDI com buffer duplo; os botões são owner-drawn para o
  tema Cerejinha.

## Limitações conhecidas

- Sem verificação de rede (ver a tabela de Status acima).
- Metadados de MP3 (ID3) não são lidos: o título da faixa é o nome do
  arquivo sem a extensão.
- As miniaturas dependem do provedor do shell do Windows para o formato em
  questão; onde não houver um, a foto aparece como "prévia indisponível".
- O build MSVC é verificado pelo CI (limpo em `/W4 /WX`); o desenvolvimento
  foi feito com compilação cruzada mingw-w64 e execução sob Wine.
