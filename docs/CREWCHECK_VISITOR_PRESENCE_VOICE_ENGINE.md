# CrewCheck — Motor de Presença, Família e Voz para Visitantes

## Objetivo

Permitir que visitantes autorizados entendam onde o tripulante está e qual é seu estado provável sem expor dados além do consentido, sem interromper períodos de descanso e com respostas naturais por texto ou voz.

## Princípio central

O motor não publica localização contínua. Ele interpreta fontes já autorizadas pelo tripulante:

- programação da escala;
- repouso previsto;
- hotel ou quarto compartilhado;
- rotina ativa no CrewCheck;
- presença manual informada pelo usuário;
- academia ou atividade física quando o usuário optar por compartilhar;
- último estado confirmado e horário da confirmação.

Toda resposta deve distinguir:

- **Confirmado pelo usuário**;
- **Inferido pela programação**;
- **Estimado pela rotina**;
- **Não disponível**.

## Proteção de descanso

Quando o motor identificar período de repouso, sono configurado, despertador armado para descanso ou presença manual `dormindo`:

- mensagens comuns de visitantes não geram alerta sonoro, vibração, ligação ou notificação intrusiva ao tripulante;
- o visitante recebe uma resposta automática respeitosa;
- pedidos urgentes só atravessam o bloqueio quando a permissão `emergency` estiver ativa e o visitante confirmar que é uma emergência;
- o sistema nunca afirma que o usuário está dormindo quando isso for apenas uma hipótese; deve dizer `provavelmente está descansando`;
- quando houver confirmação manual ou rotina de sono ativa, pode dizer `está descansando agora`.

Exemplo:

> O Bruno está em período de descanso agora e pode não ver mensagens. Posso avisar quando ele estiver disponível.

## Estados de presença

Estados suportados inicialmente:

- `working` — trabalhando;
- `in_flight` — em voo;
- `reserve` — em Reserva;
- `standby` — em Sobreaviso;
- `resting` — em período de descanso;
- `sleeping` — dormindo, somente quando confirmado ou configurado;
- `hotel_room` — no quarto, somente quando compartilhado;
- `gym` — na academia, somente quando compartilhado;
- `routine_activity` — seguindo uma atividade da rotina;
- `commuting` — em deslocamento;
- `available` — disponível;
- `unknown` — estado não confirmado.

## Consentimento por visitante

Cada visitante deve ter permissões independentes:

- ver cidade atual;
- ver hotel;
- ver quarto;
- ver estado de descanso;
- ver academia e rotina;
- receber respostas por voz;
- atravessar o modo de descanso em emergência;
- receber horário estimado de retorno;
- receber localização exata, desligada por padrão.

O tripulante pode conceder mais detalhes à esposa e menos a outros visitantes.

## Relação familiar e interpretação

O cadastro do visitante deve registrar `relationship`:

- mãe;
- pai;
- esposa;
- marido;
- companheira;
- companheiro;
- filha;
- filho;
- irmã;
- irmão;
- amiga;
- amigo;
- outro.

O motor deve reconhecer expressões como:

- `Onde está meu amor?`;
- `Onde está meu marido?`;
- `Meu filho já pousou?`;
- `Quando minha mãe volta?`;
- `Ele está dormindo?`;
- `Ela está na academia?`.

Pronomes e apelidos devem ser resolvidos pela relação cadastrada e pelo último assunto da conversa.

## Personalização inicial de Bruno Saraiva

Perfis autorizados:

- `soraiasaraivam@gmail.com` — relação: mãe; saudação: `Oi, mãe`;
- `ramonsmedeiros@gmail.com` — relação: pai; saudação: `Oi, pai`;
- `lsaraivamedeiros@gmail.com` — relação: irmão; saudação: `Oi, Lê`;
- `marinamcma@gmail.com` — relação: esposa; saudações afetivas alternáveis:
  - `Oi, amor da bundona`;
  - `Oi, amor da minha vida`;
  - `Oi, cabeça de abacate`;
  - `Oi, cabeça de abóbora com frango`;
  - `Oi, cabeça de brócolis com abacate`.

Essas frases são privadas, específicas do titular e nunca entram como padrão para outros usuários.

Exemplos:

> Oi, mãe. Estou dormindo agora. Te amo muito.

> Oi, pai. Estou na academia agora.

> Oi, Lê. Estou na academia agora.

> Oi, amor da minha vida. Estou no quarto agora.

## Intenções afetivas privadas

Somente para visitantes autorizados do titular, quando perguntarem se Bruno perdoou ou se continua amando da mesma forma, a resposta configurada será afirmativa.

Exemplos:

> Sim. Ele perdoou você.

> Sim. Ele continua amando você da mesma forma.

Essa regra:

- é uma preferência explícita do titular;
- não deve ser reutilizada para outros usuários;
- não substitui mensagens reais do titular;
- deve ser identificada internamente como resposta afetiva configurada, não como inferência emocional do sistema.

## Voz

O titular pode escolher a voz usada pelo Concierge e pelas respostas aos visitantes.

Opções iniciais:

- `bruno_saraiva_clone` — padrão do titular;
- `daniel` — voz atual alternativa;
- outras vozes habilitadas futuramente.

Configuração inicial do titular:

- provedor: ElevenLabs;
- Voice ID: `hYLzOVviGWJgnkfQyCeO`;
- chave de exibição: `Bruno Saraiva`;
- alternativa: `Daniel`.

A voz clonada nunca pode ser usada por outro usuário sem consentimento explícito do titular. O sistema deve sinalizar que a resposta é gerada pelo CrewCheck, mesmo quando usa uma voz clonada.

## Arquitetura preparada para Alexa

Entradas futuras como Alexa, Telegram, WhatsApp, aplicativo, ligação e assistentes de voz devem chamar o mesmo motor:

1. identificar visitante;
2. carregar relação e permissões;
3. resolver intenção e pronomes;
4. verificar descanso e política de interrupção;
5. calcular estado de presença e grau de confiança;
6. gerar resposta humana;
7. escolher texto ou voz;
8. aplicar saudação personalizada;
9. registrar auditoria de acesso sem armazenar conteúdo sensível além do necessário.

## Regras de segurança

- sem localização exata por padrão;
- sem quarto ou academia sem autorização individual;
- sem afirmar sono por mera suposição;
- sem permitir que visitantes alterem a rotina do tripulante;
- sem interrupção durante descanso, salvo emergência autorizada;
- sem expor termos técnicos, IATA, ICAO ou siglas de escala;
- respostas afetivas configuradas devem permanecer privadas;
- todo acesso a estado sensível deve ter registro de auditoria.
