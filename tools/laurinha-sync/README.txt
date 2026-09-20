LAURINHA SYNC — WINDOWS
========================

Aplicativo nativo em C/Win32 para simplificar o sincronismo do Laurinha em Casa com a TV LG.

Funções:
- adiciona pastas de MP3 e fotos às bibliotecas do projeto;
- abre MINHAS_MUSICAS e FOTOS_LAURINHA;
- inicia o Connected Hub;
- testa o dispositivo webOS cadastrado como CrewCheckLG;
- sincroniza a TV recarregando com.saraiva.laurinha.tv;
- abre a prévia;
- chama o instalador do pacote LG.

Modelo de sincronismo:
MP3 e fotos permanecem no PC e são servidos pelo Connected Hub. O botão "Sincronizar TV"
fecha/reabre o app na LG para ele consultar novamente os manifestos do Hub. Nenhuma mídia é
copiada para o IPK.

Pré-requisitos:
- webOS CLI no PATH: ares-device-info.cmd e ares-launch.cmd;
- dispositivo CrewCheckLG cadastrado;
- Developer Mode ativo;
- Connected Hub em execução para fotos/MP3.

Segurança:
O executável não lê nem armazena o token do Home Assistant.
