# Projeto Atlas — CrewCheck

Roadmap oficial do P0: fundação visual e operacional do CrewCheck.

## Princípios

- Nenhuma alteração de interface pode modificar o resultado do motor canônico da escala.
- Folga não é programação.
- Idioma oficial: português brasileiro (pt-BR). Siglas aeronáuticas reconhecidas (METAR, TAF, NOTAM, ATIS) permanecem.
- Erros técnicos não aparecem na interface comum; vão somente para logs.
- Toda melhoria precisa passar pelo Portão de Qualidade Atlas.

## Portão de Qualidade Atlas

Cada item só é considerado concluído após:

- validação funcional;
- validação visual;
- validação de idioma;
- teste desktop (1024, 1280, 1440, 1920);
- teste mobile (360, 390, 430);
- teste tablet (iPad mini v/h);
- modo claro e modo escuro;
- ausência de regressão na escala;
- ausência de erro técnico exposto;
- possibilidade de reversão.

## Épicos do P0

### ATLAS-P0.1 — Sistema visual único
- Paleta única em todas as telas.
- Contraste consistente.
- Sem mistura involuntária de claro/escuro.
- Cards com borda, raio e sombra padronizados.
- Botões com altura e alinhamento consistentes.
- Conteúdo respeita largura máxima.
- Sem scroll horizontal.
- Web, tablet e mobile pertencem ao mesmo produto visual.

### ATLAS-P0.2 — Menu web baseado no mobile
- Menu lateral fixo e recolhível.
- Sem modal gigante de ícones.
- Sem menu duplicado.
- Grupos curtos e compreensíveis.
- Item ativo claramente identificado.
- Nomes integralmente em português.
- Central Admin visível somente para administradores.
- Perfil elegante no rodapé do menu, sem identificadores truncados.

### ATLAS-P0.3 — Folga não é programação
- `classifyActivity` canônica decide FOLGA × PROGRAMAÇÃO.
- Folga não conta no contador de programações.
- Folga não aciona Saída Inteligente.
- Folga não usa ícone de voo.
- Card próprio de descanso.
- Concierge responde "folga", não "programação".
- Calendário distingue descanso de atividade.

### ATLAS-P0.4 — Idioma pt-BR
- Dicionário oficial centralizado.
- Eliminar inglês residual.
- Esconder termos técnicos.
- Mensagens padronizadas de erro, vazio e indisponibilidade.

### ATLAS-P0.5 — Perfil do usuário
- Nome completo + função.
- Sem e-mail, ID, plano ou nome truncado no menu.

### ATLAS-P0.6 — Google Maps
- Descobrir serviços realmente usados.
- Separar mapa interativo, estático, locais, geocodificação e rotas.
- Corrigir restrições por domínio.
- Remover erros técnicos da interface.
- Fallback amigável com link externo.

### ATLAS-P0.7 — ElevenLabs
- Preservar voz do Daniel.
- Atualizar voz do Bruno.
- Variáveis separadas: `ELEVENLABS_VOICE_ID_BRUNO`, `ELEVENLABS_VOICE_ID_DANIEL`, `ELEVENLABS_VOICE_ID` (fallback).
- Ordem de seleção: específica → usuário → padrão → TTS alternativo.
- Nenhum ID aparece na interface comum.

### ATLAS-P0.8 — Proteção do motor canônico
Toda alteração de interface deve provar que não modificou:
- quantidade de atividades;
- datas;
- horários;
- continuidade;
- origem e destino;
- reserva acionada;
- virada de meia-noite;
- pernoites;
- múltiplas atividades no mesmo dia.

## Ordem de execução

1. Baseline e roadmap (este commit).
2. Classificação canônica Folga × Programação.
3. Design tokens Atlas.
4. Estrutura de menu Atlas.
5. Dicionário pt-BR Atlas.
6. Componentes Atlas (RestCard, MapUnavailable).
7. Vozes ElevenLabs separadas.
8. PR de revisão → integração gradual.

## Commits planejados

- `chore(atlas): registrar baseline e roadmap do P0`
- `feat(schedule): separar folga de programação por classificação canônica`
- `feat(ui): adicionar tokens do Design System Atlas`
- `refactor(navigation): preparar estrutura de menu Atlas`
- `fix(i18n): adicionar dicionário oficial pt-BR Atlas`
- `feat(ui): adicionar componentes Atlas (RestCard, MapUnavailable)`
- `feat(tts): separar vozes de Bruno e Daniel`

## Observação de implementação

Este P0 é **aditivo**: novos módulos em `client/src/lib/atlas*`, `client/src/styles/atlas*` e `client/src/components/atlas/` coexistem com o código atual. A integração real (substituir chamadas existentes, montar o App Shell, instalar dependências) fica para um passo seguinte, depois da aprovação deste PR.
