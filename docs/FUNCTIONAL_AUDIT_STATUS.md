# CrewCheck — status da auditoria funcional

Atualizado para a estratégia **Web/PWA primeiro; Android assinado depois**.

## Legenda

- `PENDENTE`: ainda não há evidência funcional suficiente;
- `ESTRUTURAL`: tela, rota e fonte foram mapeadas, mas falta uso real;
- `EM TESTE`: rodada funcional iniciada;
- `CORRIGIR`: falha confirmada;
- `OCULTAR`: retirar temporariamente da navegação até correção;
- `APROVADO WEB`: aprovado em navegador/PWA;
- `APROVADO ANDROID`: aprovado também no APK/AAB assinado.

## Fase A — fonte única e fluxo principal

| Ordem | Área | Estado | Evidência necessária para avançar |
|---:|---|---|---|
| 1 | Importação CrewRosterReport normal | ESTRUTURAL | PDF oficial real importado sem perder voo ou atividade |
| 2 | Importação rotacionada | EM TESTE | PDF oficial de agosto: 32 datas, 33 atividades e 46 etapas em cliente e servidor |
| 3 | Escala canônica | ESTRUTURAL | FlyDeck, Escala e Histórico idênticos |
| 4 | FlyDeck cronológico | ESTRUTURAL | cinco etapas abrem a tela correta |
| 5 | Saída Inteligente | ESTRUTURAL | evento, apresentação, origem, rota, margem e horário coerentes |
| 6 | Fora de base/posicionamento | ESTRUTURAL | voo seguro no mesmo dia ou fallback no dia anterior |
| 7 | Hotel/pernoite | PENDENTE | localidade e intervalo corretos, sem transformar estadia em voo |
| 8 | Reserva/sobreaviso | PENDENTE | acionamento e não acionamento tratados corretamente |

## Fase B — Concierge e operação

| Ordem | Área | Estado | Evidência necessária para avançar |
|---:|---|---|---|
| 1 | Localização Telegram | ESTRUTURAL | localização recente usada; antiga expira |
| 2 | Perguntas naturais | ESTRUTURAL | variações naturais entregam a mesma resposta do comando existente |
| 3 | Contexto curto | ESTRUTURAL | “e o portão?” e referências semelhantes usam o voo correto |
| 4 | Formal/cômico | ESTRUTURAL | conteúdo factual permanece idêntico |
| 5 | Voz configurável | ESTRUTURAL | texto→texto e áudio→áudio conforme política |
| 6 | Radar econômico | ESTRUTURAL | cache/rate guard sem consulta excessiva |
| 7 | Seguir qualquer voo | PENDENTE | voo informado pelo usuário acompanhado sem substituir o voo da escala |
| 8 | Meteorologia | PENDENTE | aeroporto solicitado prevalece sobre fallback |
| 9 | Despertador | PENDENTE | agendamento, disparo, soneca e ausência de duplicidade |

## Fase C — regulamentação, financeiro e conta

| Área | Estado | Evidência necessária |
|---|---|---|
| Regulamentação | PENDENTE | mesma jornada e apresentação da escala canônica |
| Carga de trabalho | PENDENTE | totais coerentes com as atividades reais |
| Diárias | PENDENTE | janelas, localidade e pernoite corretos |
| Salário/produção | PENDENTE | regras e demonstrativos sem valores fictícios |
| Calendário | PENDENTE | criar/atualizar sem duplicidade |
| Exportações | PENDENTE | PDF/ICS coerentes com a escala ativa |
| Login/cadastro/recuperação | PENDENTE | estados normal, erro e conta existente |
| Google OAuth | PENDENTE | retorno correto e erro legível |
| Asaas | PENDENTE | webhook idempotente e assinatura atualizada |
| Exclusão de conta | PENDENTE | confirmação, remoção e mensagem final |
| Admin/permissões | PENDENTE | usuários comuns não acessam funções administrativas |

## Fase D — visual e conteúdo

| Área | Estado | Evidência necessária |
|---|---|---|
| Marca canônica | ESTRUTURAL | mesma identidade em cabeçalho, menu, login e PWA |
| Menu e rodapé | ESTRUTURAL | sem corte, sobreposição ou duplicidade |
| Claro/escuro | PENDENTE | contraste e legibilidade em todas as superfícies |
| Mobile Web | PENDENTE | 360 px e 412 px com scroll útil |
| iPad/tablet | PENDENTE | layout sem elementos gigantes ou presos |
| Desktop | PENDENTE | uso adequado da largura e ações visíveis |
| CrewCheck Life | PENDENTE | opcional, seguro e sem interferência operacional |
| Página Sobre mim | PENDENTE | identidade profissional e conteúdo atualizado |

## Fase E — Android, somente após Web/PWA estável

| Entrega | Estado |
|---|---|
| APK release assinado | ADIADO |
| AAB Play Console assinado | ADIADO |
| Compartilhamento de PDF para o app | ADIADO |
| Notificações em segundo plano | ADIADO |
| Deep links | ADIADO |
| Ícone launcher/adaptive icon | ADIADO |
| Instalação e atualização sobre versão anterior | ADIADO |

## Evidência da rodada v14.3.45 — agosto de 2026

- PDF oficial rotacionado validado diretamente nos parsers Web/PWA e servidor;
- resultado conferido: 32 datas únicas, 33 atividades, 46 etapas, FH 67:40 e DH 142:35;
- carry-in de 30/07, dois MCK em 07/08 e carry-out de 01/09 preservados;
- fixture versionado permanece anonimizado e a regressão cobre orientações ascendente e descendente;
- próximo gate: validar um CrewRosterReport oficial não rotacionado e, depois, comparar FlyDeck, Escala e Histórico.

## Regra de prioridade

Durante a auditoria não serão aceitas funcionalidades novas. A ordem de correção é:

1. dado operacional incorreto ou fictício;
2. função principal quebrada;
3. tela inacessível ou sem retorno;
4. erro de integração que destrói ou duplica dados;
5. layout/contraste;
6. conteúdo institucional.

Nenhum item `ESTRUTURAL` deve ser tratado como aprovado sem evidência de uso real.
