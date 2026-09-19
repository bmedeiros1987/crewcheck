# Configuração compacta do piloto real

O Render recusou a adição de cinco variáveis e também de uma única variável por limite de 300 no serviço preview #698. Nenhuma variável existente foi apagada, substituída em lote ou divulgada. O piloto permanece desligado até configuração válida; não substituir esse bloqueio por uma liberação geral.

Para reduzir a necessidade de espaço, o backend aceita UMA variável CREWCHECK_TV_PILOT_CONFIG com JSON estrito:

```json
{"enabled":true,"accountSha256":"<64 caracteres hex do e-mail autenticado normalizado>","origin":"https://preview-autorizado.example","bootstrap":true}
```

O placeholder é ilustrativo: inválido até preenchimento autorizado no Render. O hash/identidade não integra o bundle cliente. Falha de formato ou múltiplas contas fecha acesso. CREWCHECK_TV_ENABLED=false continua sendo kill switch prioritário, caso já exista. Bootstrap só pode criar o registry isolado em IS_PULL_REQUEST=true.

A página /tv-pair consulta o status do backend em tempo de execução; não precisa mais de outra variável VITE de publicação. Status não concede acesso: approve/devices/revoke e o token de TV são verificados no servidor. Não alterar o domínio/URLs de produção, nenhuma migração de contas/escala e nenhum merge em main.

Antes de ativar, verificar somente nomes das configurações do preview e identificar eventual chave TV preexistente ou variável comprovadamente obsoleta. Não mostrar valores/segredos, não apagar variáveis aleatórias, não usar replace=true. Sem espaço comprovado ou acesso de edição adequado, reportar o bloqueio ao usuário.
