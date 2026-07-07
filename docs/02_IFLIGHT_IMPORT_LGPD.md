# CrewCheck v13 — Importação iFlight com LGPD

## URL

https://iflightla.ibsplc.aero/iflight-cwp/web/getMainPage

## Regra principal

O CrewCheck NÃO pode armazenar, capturar ou reutilizar:
- usuário;
- senha;
- MFA;
- código SMS;
- cookies;
- session token;
- refresh token;
- localStorage/sessionStorage autenticado;
- HTML bruto sensível;
- screenshots do portal autenticado;
- logs com headers, cookies, credenciais ou tokens.

O usuário sempre informa usuário, senha e MFA manualmente no portal oficial, em ambiente corporativo/autorizado.

## Proibido

- lembrar login;
- manter conectado;
- salvar cookies;
- login automático;
- ler SMS;
- ler notificações;
- acessar clipboard para MFA;
- interceptar campos de senha/MFA;
- gravar logs técnicos com dados sensíveis.

## Permitido

- abrir portal oficial em WebView/Custom Tab efêmera;
- usuário digitar credenciais corporativas e MFA diretamente no portal;
- usar sessão temporária apenas em memória durante a execução;
- baixar escala autorizada após login manual;
- processar arquivo pelo parser canônico;
- limpar toda sessão ao final.

## Fluxo

1. Usuário toca em "Importar Escala da Companhia".
2. App abre WebView/Custom Tab efêmera.
3. Usuário faz login manualmente.
4. Usuário informa MFA manualmente.
5. Usuário toca em "Continuar importação".
6. App mascara captura/processamento com tela de progresso.
7. App garante LT.
8. App baixa roster/PDF/Duty Report.
9. App processa pelo parser canônico.
10. App atualiza módulos.
11. App limpa sessão.
12. App mostra resumo de alterações.

## Tela de progresso

Título: Sincronizando Escala.

Mensagem fixa:
"O CrewCheck não armazena login, senha, MFA ou sessão."

Etapas:
1. Abrindo ambiente corporativo seguro
2. Aguardando login e MFA manual
3. Validando acesso autorizado
4. Ajustando calendário para Local Time (LT)
5. Lendo calendário em LT
6. Lendo programações
7. Lendo tripulações
8. Lendo hotéis
9. Baixando escala
10. Processando arquivo
11. Sincronizando escala
12. Atualizando próxima programação
13. Atualizando Saída Inteligente
14. Atualizando Despertador Inteligente
15. Atualizando Rotina
16. Atualizando Diárias
17. Atualizando Salário
18. Atualizando Meteorologia
19. Atualizando Radar
20. Limpando sessão temporária
21. Finalizando importação

## Local Time Guard

Antes de baixar:
- tentar configurar portal para Local Time (LT);
- confirmar que escala está em LT;
- se não conseguir, mostrar:
"Altere o calendário para LT antes de continuar."

Nunca processar como UTC quando a escala operacional deve ser LT.

## Fallback

Se download automático for bloqueado:
- orientar download manual;
- usuário escolhe PDF;
- app processa automaticamente;
- limpar sessão temporária.
