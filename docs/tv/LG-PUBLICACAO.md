# CrewCheck TV — identidade mobile e publicação LG

Atualizado em 18/09/2026. Este arquivo é um guia do projeto, NÃO substitui o formulário oficial da LG.

## O que foi implementado neste slice

Logo: importação direta do PNG original `client/public/icons/crewcheck-icon-v2.png`. O preparador mobile `scripts/v14340/ui.mjs` copia os mesmos bytes para o alias v3; não executar esse preparador apenas para obter a logo, pois ele também modifica parsers e telas. Cores principais importadas de `client/src/lib/brand.ts`; aparência escura para TV e clara com superfícies pastel do app. Ícones de navegação Lucide, já usados pelo Home mobile. Arte vetorial de clima desenhada no componente local, sem biblioteca ou API adicional.

Movimento: entrada suave de tela, nuvens, raios do sol, chuva/neve, destaque lento do horário e alternância suave de mensagens do ticker. Configurações: Completo / Suave / Desligado. Respeita reduced-motion; pausa quando o app está oculto. A marca e os horários não giram nem piscam. Não suprime o screensaver da TV e não promete prevenção de burn-in.

Só o texto de condição já fornecido pelo snapshot é mapeado para ilustração. Sem condição confiável = ícone neutro; 0°C não é interpretado como ausência. A TV não obtém notícias de terceiros, não infere APZ a partir de decolagem, não altera escala, não decide privacidade/assinatura localmente. Mantém os tokens e controles do piloto existente.

Pacote de teste: `online.crewcheck.tv.demo_0.1.1_all.ipk`. Dados fictícios, separados da conta. NÃO ENVIAR ESTE PACOTE À LOJA. O candidato não-demo continua dependendo do backend e dos gates abaixo. `operational=true` no manifesto de build não comprova backend ativo, suporte certificado nem integração finalizada.

## Instalar a prévia no PC Windows já pareado

Salve o IPK em Downloads. No PowerShell:

```powershell
cd "$HOME\Downloads"
ares-install.cmd --device CrewCheckLG .\online.crewcheck.tv.demo_0.1.1_all.ipk
ares-launch.cmd --device CrewCheckLG online.crewcheck.tv.demo
```

Se a versão anterior estiver aberta, feche antes: `ares-launch.cmd --device CrewCheckLG --close online.crewcheck.tv.demo`. Não é necessário apagar chaves ou reinstalar o Node. O novo número de versão distingue este pacote das correções 0.1.0 anteriores.

## Caminho para a LG Store

1. Abrir LG Seller Lounge e concluir cadastro Individual Seller (pessoa) ou Corporate Seller (empresa). Conta Developer Mode e conta Google Play NÃO publicam automaticamente na LG. Escolher o titular correto antes do envio.
2. Cadastrar o app webOS no portal. Nome proposto CrewCheck TV; ID técnico candidato `online.crewcheck.tv`. O ID precisa ser definitivo antes da publicação, porque não é alterável depois. Informar descrição, idiomas, países, suporte e privacidade conforme campos atuais do portal. Brasil/pt-BR é um recorte inicial proposto, não submissão já realizada.
3. Gerar o IPK de release NÃO-DEMO de um SHA revisado. Preservar o ID e aumentar versão em novas submissões. O appinfo.json declara id/title/type/main/icon/version. Ícone interno 80×80 PNG, largeIcon 130×130; ícone de catálogo enviado separadamente 400×400. Capturas devem mostrar a aplicação real, sem prometer funções pendentes. Confirmar os demais tamanhos no Seller Lounge na data do upload.
4. Preparar UX Scenario no modelo do portal: abertura, conexão/QR, aprovação no celular, modos de privacidade, consulta Agora/Semana/Mês/Dia, notícias, tema/movimento, desconexão/expiração/erro e retorno pelo controle. Disponibilizar conta de revisão dedicada com escala sintética, nunca a conta pessoal do proprietário. Seu login e os servidores devem estar acessíveis à equipe de revisão.
5. Baixar a versão vigente do App Self Checklist na página oficial; preencher resultados reais por modelo/versão. Não marcar PASS para testes não executados e não usar N/A para funcionalidades presentes. Anexar formulário e UX Scenario juntamente com IPK/imagens.
6. Enviar para aprovação no Seller Lounge. A LG realiza pré-teste, teste funcional e avaliação de conteúdo. Corrigir apontamentos e reenviar uma versão maior quando exigido. Atualizações também passam por aprovação. Não existe aprovação automática por instalar com Developer Mode.

## Gates do CrewCheck antes de pedir a revisão

- [ ] Core/PRs dependentes revisados; #530/#607 não contornados por sucesso visual.
- [ ] Backend de TV implantado com migração e autenticação homologadas, sem confundir build flag com feature flag do servidor.
- [ ] Duas contas e duas TVs: pareamento, escopo, privacidade família/privado, revogação e logout testados.
- [ ] Escala ativa real e continuidade de competência validadas; APZ publicado correto e nenhum fallback STD.
- [ ] Saída, portão/Remota, clima e mudanças conectados a fatos com validade, ou claramente não oferecidos.
- [ ] Direitos de notícias/imagens e assinatura/entitlements confirmados; informações essenciais fora do bloqueio comercial.
- [ ] Reabertura, expiração, suspensão e perda de rede testadas. O piloto atual mantém credencial em memória e pede novo pareamento ao reabrir; decidir e documentar experiência final antes da loja.
- [ ] D-pad, OK, Back, ponteiro Magic Remote e seleção visível em todos os controles testados.
- [ ] Back na tela inicial validado conforme a versão webOS. A documentação LG tem diferenças entre sua página de Back e o checklist; aplicar os critérios atuais do programa de QA para os alvos selecionados.
- [ ] Testar 55SM9000PSA/webOS 4.x e pelo menos um webOS recente. Bundle Chromium 53 não é prova de todas as TVs.
- [ ] Capturas reais, suporte e URL de privacidade funcionando; conta de revisão criada; documentos LG preenchidos.

## Limites de evidência

A navegação da versão anterior foi confirmada pelo usuário na LG 55SM9000PSA. Este visual/animações novos requerem outra instalação nessa TV. TypeScript/build/testes e screenshots de navegador não equivalem a homologação física LG nem aprovação de loja. Nenhum deploy Render, termo de loja ou submissão é efetuado por este slice.

## Fontes oficiais consultadas em 18/09/2026

- https://seller.lgappstv.com/
- https://webostv.developer.lge.com/distribute/app-ecosystem
- https://webostv.developer.lge.com/distribute/app-approval-process
- https://webostv.developer.lge.com/distribute/app-self-checklist
- https://webostv.developer.lge.com/develop/references/appinfo-json
- https://webostv.developer.lge.com/develop/guides/back-button
- https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine
