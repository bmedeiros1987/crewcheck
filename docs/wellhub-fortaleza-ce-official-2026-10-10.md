# Fortaleza/CE — catálogo oficial Wellhub, 10/10/2026

Base investigada: `5fc76a09e568de215b7a0b6cec9a50c9fa139fa7` (main). Nenhum AGENTS.md ou skill local foi encontrado no checkout ou em `/workspace/.agents` (diretório vazio). PRs relacionadas conferidas: #569 (catálogo inicial), #899/#903/#904 (plano/roteamento), #943 (DF, já integrada). Nenhuma PR aberta de correção do catálogo Fortaleza foi encontrada; #873 é scheduler de wellness, outro escopo. #983/#975, notificações e Play permanecem fora desta alteração.

## Causa e reprodução

O catálogo compartilhado pelo servidor e web tinha 34 unidades: 19 SP e 15 DF, zero CE. `searchVerifiedWellhub({plan:'silver-plus',locationText:'Fortaleza CE',live:false})` retorna `[]`. A mensagem relatada já identifica Fortaleza/CE; não há evidência de falha de geolocalização nesse resultado. A hierarquia existente é cumulativa e aceita Basic+/Silver sob Silver+; não foi alterada.

O novo teste falhou primeiro por 0 versus 4 unidades. Depois de incluir somente as quatro fichas abaixo, reproduziu outro defeito: GPS expirado e base/próximo aeroporto BSB retornavam unidades DF. O handler agora pede nova localização quando o estado é `stale`, antes de consultar catálogo, salvo cidade explícita na mensagem. O TTL existente de 6h e sua fronteira (válido exatamente em 6h, expirado após isso) ficam preservados. GPS fresco Fortaleza/CE prevalece sobre base BSB; GPS fresco sem cidade/UF pede recuperação e não substitui pelo aeroporto. A localização ausente mantém o fallback operacional existente; não representa GPS atual confirmado.

## Fontes individuais

Páginas públicas oficiais abertas em 10/10/2026, sem login, conta, coordenadas privadas, check-in ou dados pessoais. URLs consultadas diretamente; distâncias dos blocos de recomendações e metadados indexados não são usadas. O mínimo refere-se à ficha daquela unidade, não à rede.

| Unidade | Acesso publicado | Endereço na ficha | Fonte |
| --- | --- | --- | --- |
| Greenlife Messejana | Basic+ | R. José Hipólito, 264, Shopping Giga Mall, Messejana, Fortaleza/CE | https://wellhub.com/pt-br/search/partners/greenlife-messejana-messejana/ |
| Greenlife Cambeba | Basic+ | Av. Frei Cirilo, 3270 - 26, Messejana, Fortaleza/CE | https://wellhub.com/pt-br/search/partners/greenlife-cambeba-messejana/ |
| Porão Academia Messejana 24h | Silver | Av. Washington Soares, 9393, Loja 01, Messejana, Fortaleza/CE | https://wellhub.com/pt-br/search/partners/porao-academia-messejana-24h-guajeru/ |
| MaxForma Messejana | Basic em horários específicos; Basic+ em todos os horários | R. Joaquim Felício, 809 - 01, Guajerú, Fortaleza/CE | https://wellhub.com/pt-br/search/partners/maxforma-messejana/ |

Greenlife Messejana publica seg–sex 05h–22h30, sáb 08h–16h, dom 08h–12h; exige agendamento nas atividades, exceto musculação. Cambeba publica os mesmos horários e dispensa agendamento. Porão publica 00h–23h59 todos os dias e se descreve como 24h, sem agendamento. MaxForma publica seg–sex 05h–23h59, sáb 06h–21h, dom 07h–19h a partir de Basic+, sem agendamento. Horários podem mudar em feriados.

MaxForma usa `minimumPlan: basic-plus` conservadoramente para todos os horários publicados, com nota visível preservando Basic restrito; não promete acesso irrestrito Basic nem inventa horários do plano restrito. Captura inicialmente indexada mostrava Basic+, enquanto a abertura atual mostra Basic restrito e Basic+ integral. A nota explicita a diferença. O modelo atual não calcula elegibilidade por janela específica de plano.

Hierarquia pública: https://wellhub.com/pt-br/plans-pricing/ — Digital → Starter → Basic → Basic+ → Silver → Silver+ → Gold → Gold+ → Platinum → Diamond → Diamond+. Fichas individuais estabelecem acesso a partir do plano mínimo; não foi alegada citação literal de acesso universal a todas as academias. Silver+ permite os mínimos confirmados nestas quatro fichas.

## Validação e limites

`regression-wellhub-fortaleza-official.mjs` executa catálogo/busca real e formatter real (raw e materializado), cidade/UF positiva/contraditória, filtros de rede/unidade, Basic+/Silver/Silver+, GPS fresco versus BSB, fronteira 6h, expirado sem busca, cidade explícita após expiração, GPS sem cidade, fonte futura/expirada e modalidade desconhecida. A regressão de conversas executa os entrypoints reais de Telegram, WhatsApp e app → wrapper → core → handler → catálogo para Fortaleza; transportes, armazenamento e identidade são sintéticos.

Testes não consultam perfis reais nem enviam mensagens. `live:false` impede leitura externa durante os testes. Não foram editados geocoder, credenciais, APIs, assinatura Wellhub, fórmulas financeiras ou infraestrutura. Catálogo é snapshot público limitado a quatro unidades; não estabelece condições contratuais de uma conta nem garante check-in. Modalidades sem evidência específica continuam `unknown`; fontes com mais de 90 dias continuam `unknown`. Filtro ausente/sem resultado mantém aviso honesto e fonte oficial; não substitui por outra cidade.

PR draft requer revisão independente do HEAD e CI antes de qualquer merge/publicação. Este trabalho não efetua deploy.

Validação local final (Node 24.19.0): build canônico e TypeScript PASS; conversa raw 19/19 e compilada 19/19; plano/persistência 13/13 raw e compilado; regressões Fortaleza raw/compilada, DF e v14410 PASS; sintaxe servidor/WhatsApp e diff sem whitespace PASS. Uma execução intermediária de conversa compilada falhou em onboarding durante preparação concorrente; o teste na base limpa passou 18/18 e a repetição sequencial do build candidato passou 19/19. Não se atribui esse resultado intermediário a um defeito confirmado da base. O CI usa Node 22 e repete os gates na PR.
