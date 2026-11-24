# CrewWatch — passagem de bastão para o Claude Code

Protótipo visual: `crewwatch.html`, nesta mesma pasta (abrir no navegador). Todos os dados são fictícios (DEMO).
Este documento resume as decisões tomadas para continuar a implementação no repositório do CrewCheck.

## Objetivo
Mostrador Wear OS redondo (450 × 450) que acompanha a rotina do tripulante ao longo do dia,
para usar o CrewCheck sem olhar o celular. Operação e saúde ficam sempre juntas.

## Direção escolhida: "Painel de Voo" (digital operacional)
- **Hora em placas tipo letreiro:** 4 placas de 54 × 88 px, centro em x = 225, y = 110–198. Hora em branco, minutos no acento do tema.
- **Arco da etapa:** semicírculo superior, r = 202, de 270° a 90° passando por 12 h. Trilha a 9 % de branco, progresso em gradiente do acento. O arco mede **tempo**, não GPS.
- **Marcador:**
  - avião acompanhando a tangente (em voo e no aeroporto);
  - carro de perfil, sem rotação (deslocamentos);
  - lua no repouso;
  - despertador no despertar.
- **Faixa central (y 234–306):** 3 colunas configuráveis por fase (rótulo, valor e status opcional). A primeira coluna é o dado principal (34 px; 27 px se tiver mais de 3 caracteres).
- **Linha de saúde:** batimentos, passos, sono e bateria. Abaixo dela, a linha "DEPOIS/AMANHÃ" com a etapa seguinte.
- **Atalhos fixos:** Escala (287°), Saída Inteligente (253°), Despertador (73°) e Alertas (107°), todos em r = 172. Alvo visível de 46 px e área de toque de 48 dp.

## Fases do dia (exemplos DEMO)
| Fase | Arco | Col. 1 | Col. 2 | Col. 3 / status |
|---|---|---|---|---|
| Despertar | despertar → saída | SAIR ATÉ | TRAJETO | SONO |
| Saída Inteligente | contagem até sair | SAIR EM (min) | TRÂNSITO | CHEGA A TEMPO |
| Deslocamento (carro) | casa → aeroporto | CHEGADA | FOLGA | CHEGA A TEMPO |
| Apresentação | apresentação → decolagem | PORTÃO | EMBARQUE | NO HORÁRIO |
| Embarque | idem | PORTÃO | EMBARQUE | EMBARQUE ABERTO |
| Em voo (avião) | decolagem → pouso | POUSO | RESTAM | DESTINO |
| Conexão | pouso → próxima decolagem | PORTÃO | EMBARQUE | NO HORÁRIO |
| Fim de jornada (carro) | traslado ao hotel | JORNADA | HOTEL | REPOUSO MÍN. |
| Repouso (tema lavanda) | fim da jornada → próxima apresentação | DESPERTAR | APRESENT. | META SONO |

## Alertas (mesmo layout, nunca cobrem hora nem saúde)
- **Cores:** arco, valor alterado e selo do atalho Alertas ficam âmbar `#FFB020`. O valor antigo aparece riscado.
- **Casos:** portão alterado, atraso (+N min) e trânsito.
- **Níveis de chegada** (Saída Inteligente e Deslocamento; texto em duas linhas na coluna 3):
  | `status` | Cor | Texto | Regra |
  |---|---|---|---|
  | `ok` | verde `#3DDC97` | CHEGA / A TEMPO | folga ≥ 10 min |
  | `limit` | âmbar `#FFB020` | CHEGA / NO LIMITE | 0 ≤ folga < 10 min |
  | `late` | âmbar forte `#FF8A1F`, placa cheia com texto escuro | VAI / ATRASAR | chegada prevista depois da apresentação (folga negativa) |
  - Em `limit` e `late`, a chegada e a folga novas aparecem na cor do nível e as anteriores riscadas; o arco e o selo de Alertas ficam âmbar.
  - O nível `late` não depende só da cor: a placa cheia o diferencia de `limit` também em leitura rápida.
  - Protótipo: seção "Trânsito · níveis de chegada" em `crewwatch.html`.

## Cores reservadas
- **Fixas:** âmbar `#FFB020` só para alerta (e âmbar forte `#FF8A1F` só para VAI ATRASAR); coral `#FF6B6B` só para batimento; verde `#3DDC97` só para OK/a tempo.
- **Temas:** Glaciar `#5ED3F3` (padrão), Pista `#B9E35C`, Lavanda `#A99CFF`, Titânio `#E4E8EC`. Nenhum tema cobre/laranja, para não confundir com alerta.

## Contrato de dados sugerido (celular → relógio)
```json
{
  "phase": "DESLOCAMENTO",
  "arc": { "start": "2026-11-20T05:55-03:00", "end": "2026-11-20T06:33-03:00", "marker": "car" },
  "top": { "label": "DESLOCAMENTO · CASA → GRU", "title": "APRESENTAÇÃO 06:45" },
  "cols": [
    { "label": "CHEGADA", "value": "06:33" },
    { "label": "FOLGA", "value": "12", "unit": "min" },
    { "label": "STATUS", "status": "ok", "text": ["CHEGA", "A TEMPO"] }
  ],
  "after": { "label": "1º VOO", "value": "DM 0420 · 08:10" },
  "alert": null,
  "updatedAt": "2026-11-20T06:12-03:00",
  "source": "roster | live"
}
```
- O progresso do arco é calculado no relógio a partir de `start` e `end`, sem depender de nova mensagem a cada minuto.
- `alert` traz `{ "kind": "gate|delay|traffic", "field": "cols[0]", "old": "B12" }`.
- `status` da coluna: `ok | limit | late | info | rest`. O celular calcula o nível (a folga e a chegada prevista vêm da Saída Inteligente); o relógio só desenha.

## Regras de fase
- O celular (app CrewCheck) decide a fase pelos horários do roster: apresentação, partida/chegada de cada etapa e fim de jornada.
- A saída de casa usa o cálculo da Saída Inteligente; a saída de uma área em volta de casa confirma.
- Em voo, a fase se baseia nos horários de saída e chegada do voo, nunca em GPS. Sem dado ao vivo, mostrar "previsto".
- Portão e status ao vivo **não vêm do roster**: precisam de uma fonte externa (sistema de operações ou API de voos).
- Dado antigo: mostrar aviso discreto ("atualizado há 12 min").

## Pontos a verificar na implementação
- [ ] **WFF ou app de mostrador:** se o Watch Face Format (exigido para novos mostradores na Play Store) comporta uma faixa de 3 colunas alimentada por um data source próprio. Opções: vários slots de complicação fixos (SHORT_TEXT/LONG_TEXT/RANGED_VALUE) ou outra abordagem.
- [ ] **Transporte:** canal celular → relógio (Wearable Data Layer) e frequência de atualização.
- [ ] **Despertador:** armar automaticamente pela escala do dia seguinte, ou pedir confirmação ao tripulante.
- [ ] **AOD:** só arco a 40 %, hora e coluna 1; sem textura; menos de 15 % de pixels acesos.
- [ ] **Saúde:** dados de passos, batimento e sono vêm do sistema do relógio (Health Services / complicações do sistema), não do CrewCheck.

## Primeiro passo sugerido no Claude Code
1. Colocar `crewwatch.html` e este arquivo em `design/crewwatch/` no repositório.
2. Pedir ao Claude Code para mapear onde o CrewCheck já tem os horários de apresentação/etapas e a Saída Inteligente.
3. A partir disso, propor o módulo Wear OS e o contrato acima, antes de escrever código.
