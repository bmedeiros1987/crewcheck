# Correção focada após PR1001

Base reproduzida: main e854ea909dd26429cc40e22ec4ecf12d26be6620, árvore idêntica à candidata 12cd2c554952a88d30faed16f4e0a1be167449d0. Ambos os achados foram confirmados em fixtures sintéticas, sem rede real de mensagens.

- discussion_r4240900943: ausência de cache de preferências produzia ready:true com Telegram herdado antes da consulta autenticada. Agora ausência de canal permanece pendente; a projeção autenticada precisa fornecer um canal. O teste usa o instalador real da projeção, retém/falha sua resposta enquanto prontidão de Telegram já existe e depois retorna telefone, ligação Telegram, combinação e Telegram. Apenas o último canal pode ficar pronto. A escolha específica por alarme continua independente da herança.
- discussion_r4240900944: cadastrar o primeiro telefone, com settings ausente, gravava Pulse=false apesar da preferência anterior true. A inicialização que também fixava Telegram/trânsito/Concierge=false foi removida. A edição do primeiro telefone exige revisão/importação explícita na central; não há importação automática de dados antigos, que podem pertencer a outra conta. Depois dessa revisão, salvar telefone altera somente seu campo e preserva os quatro avisos, canal e antecedência. Digitar não envia nada.

Impacto: em aparelho sem preferência herdada consultada, o alarme permanece pendente em vez de assumir Telegram. Se as configurações da conta ainda não existem, o usuário precisa revisar/importar as escolhas antes de informar o primeiro número. Nenhuma preferência antiga é apagada, nenhum canal pago é habilitado e nenhuma permissão é solicitada.

Regressões preservadas: armazenamento e troca de conta, escopo atrasado, histórico de jobs retido/falho, handler antigo no mesmo tick e antecedência75/90. UI central/BIDS continua verificada em claro/escuro e texto ampliado. Build e TypeScript raw/preparado verificam a mudança. Não altera main.tsx, projeção global, runtime/editor de pernoite, Cirium, Watch/Calendar, providers, credenciais ou flags.

PR draft sucessora para revisão independente. PR1001 já está integrada; esta correção não será integrada com blockers. Consulta Render permanece bloqueada pela confirmação de workspace pendente no parent. Não houve envio real, chamada, ativação paga ou publicação em loja.
