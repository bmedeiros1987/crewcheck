# CrewCheck v13.5.5 — Operational Core Recovery Audit

## Objetivo
Priorizar funcionalidade antes de novas mudanças visuais.

## Corrige / restaura
- API central de mapas para rota ponto A → ponto B.
- Endpoint de radar de voos com configuração por ambiente.
- Botão Hoje da escala, abrindo e rolando para o dia atual.
- Google Calendar com seleção do calendário de destino.
- Menu Academias com Smart Fit / Wellhub / academias próximas ao hotel.
- Hotéis com entorno e academias próximas.
- Rotina inteligente com janelas de treino e recuperação.
- Auditoria operacional em relatórios, diárias, salário e irregularidades.
- CSS anti-overflow para evitar cards estourados.

## Configuração recomendada no Render
- VITE_GOOGLE_MAPS_API_KEY: chave restrita por domínio para mapas embutidos.
- GOOGLE_MAPS_SERVER_KEY: chave restrita no backend para rotas/locais.
- CREWCHECK_FLIGHT_STATUS_URL ou AVIATIONSTACK_API_KEY: fonte real de status de voos.
- VITE_GOOGLE_CLIENT_ID: OAuth do Google Calendar.

## Preservado
- Parser AIMS/CrewRoster.
- Motor canônico.
- Continuidade física/anti-teletransporte.
- Import Guardian.
- Roster inline expansível.
- Gerenciador de Apresentação.
- Sem credenciais, senha, MFA, cookies ou sessão.
