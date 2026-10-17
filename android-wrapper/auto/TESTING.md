# Homologação do CrewCheck Drive Lab

Registrar AUTO_COMMIT.txt, MOBILE_COMMIT.txt, versão do telefone/Android Auto/DHU e resultado de cada cenário. Usar dados sintéticos quando possível; nunca anexar senha, cookies, tokens, CPF, dados de saúde ou fotos da tela de login preenchida.

## 1. Testes automatizados

O workflow Auto roda os 30 testes JVM existentes e dez cenários em cada Android simulado API 28/36. Verificar zero failures/errors/skips nos XMLs, packages separados e certificados debug correspondentes. Robolectric + TestCarContext não são uma central, não se conectam ao backend e não comprovam o provider Mobile em outro processo.

## 2. Teste no telefone

Instalar Phone Lab e Drive Lab do mesmo artefato, sem remover o CrewCheck principal. Confirmar que destinos manuais funcionam com sync desativado. Em seguida abrir uma escala válida no Phone Lab, ligar sync no Drive Lab e conferir status e destino. Não confundir ausência de deslocamento em folga com falha de sincronização. O login Phone Lab usa o backend principal; tratar indisponibilidade do banco separadamente de assinatura ou parsing do adapter.

## 3. DHU com telefone conectado

Seguir o guia oficial para instalar Desktop Head Unit pelos SDK Tools do Android Studio e habilitar o modo desenvolvedor do Android Auto. No telefone, iniciar o servidor de unidade principal; conectar USB e autorizar a depuração apenas no computador de teste. Confirmar o dispositivo com `adb devices`. Com um único dispositivo de teste conectado:

    adb forward tcp:5277 tcp:5277

Iniciar `desktop-head-unit` na pasta `extras/google/auto` do SDK (no Windows, `desktop-head-unit.exe`). Não instalar uma imagem Android Automotive como se fosse o mesmo teste de projeção Android Auto. Ao terminar, remover o encaminhamento específico e parar o servidor de unidade principal:

    adb forward --remove tcp:5277

Checklist mínimo:

- [ ] CarAppService abre a tela inicial sem precisar abrir a tela de configuração primeiro.
- [ ] Lista, detalhe, Voltar e Buscar rota funcionam; endereço é conferido no navegador, sem inventar terminal/entrada.
- [ ] Dia/noite, duas resoluções e controle por toque/rotativo permanecem legíveis.
- [ ] Se o destino expirar com o detalhe aberto, a tela muda para atualização necessária; tocar num botão antigo nunca inicia a rota.
- [ ] Voltar rapidamente da lista ao detalhe não apaga a projeção; sair de todas as telas descarta o cache e não mantém status de conexão antigo.
- [ ] Desativar sync remove destinos canônicos e preserva destinos manuais.
- [ ] Perda de telefone/provider e erro de assinatura não causam crash nem acesso não autorizado.
- [ ] Login, logout, troca de conta e mudança de escala têm resultados registrados separadamente. Qualquer dado da conta anterior é bloqueio de produção; o contrato atual ainda não resolve esse gate.

## 4. Central real — somente estacionado

A opção Fontes desconhecidas não se aplica a aplicativos Car App Library. APK sideloadado não é evidência de que o app deve aparecer na central. Preparar distribuição pela Play em mecanismo permitido para testes e obter autorização específica antes de enviar o app.

Internal App Sharing re-assina o package. Para testar a ponte signature, verificar os certificados **instalados**, não apenas a chave de upload ou os APKs originais do Actions. A atual igualdade de chaves debug do par não sobrevive automaticamente à distribuição pela Play. Não remover a permissão signature nem as verificações de caller/certificado para forçar conexão. A estratégia do par deve ser tratada com Mobile Core #839.

## Evidência e decisão

Marcar cada etapa como NÃO TESTADO, PASS ou FAIL, com ambiente e SHA. Não converter build verde, HTTP 200 de liveness, TestCarContext ou screenshot isolado em aprovação da integração completa. Permanecem sem merge/publish até resolver os gates aplicáveis.

Referências: https://developer.android.com/training/cars/testing ; https://developer.android.com/training/cars/testing/dhu ; https://support.google.com/googleplay/android-developer/answer/9844679
