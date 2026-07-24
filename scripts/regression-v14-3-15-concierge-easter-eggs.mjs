import fs from 'node:fs';
import vm from 'node:vm';

const path = 'server/v1403/build-reply.snippet';
const source = fs.readFileSync(path, 'utf8');
const helperSource = source.split('async function buildTelegramConciergeReply')[0];
const context = { Math, JSON, String, Array, RegExp };
vm.createContext(context);
vm.runInContext(`${helperSource}\nthis.reply = conciergeEasterEggReply;`, context);

const reply = context.reply;
if (typeof reply !== 'function') throw new Error('[v14.3.15] conciergeEasterEggReply não foi carregada.');

function expectMatch(input, pattern, snapshot = null) {
  const output = String(reply(input, {}, snapshot) || '');
  if (!pattern.test(output)) throw new Error(`[v14.3.15] Resposta inválida para "${input}": ${output}`);
}

function expectEmpty(input) {
  const output = String(reply(input, {}, null) || '');
  if (output) throw new Error(`[v14.3.15] Falso positivo para "${input}": ${output}`);
}

expectMatch('Quem é você?', /Bruno Saraiva|Concierge do CrewCheck/);
expectMatch('Qual é seu nome?', /Bruno Saraiva|Concierge do CrewCheck/);
expectMatch('Você é um bot?', /tecnologia|humanidade|colega confiável/i);
expectMatch('Qual é sua missão?', /cuida|cuidar|operação sozinho/i);
expectMatch('Qual é seu lema?', /sozinho|cuida|cuidar/i);
expectMatch('Quem te criou?', /tripulante/i);
expectMatch('Você é casado?', /Marina Alves/);
expectMatch('Você tem filhos?', /Laura/);
expectMatch('Você dorme?', /descanso|dormir/i);
expectMatch('Você fica cansado?', /cansado|descanso|atenção/i);
expectMatch('Você sonha?', /tranquil|CrewCheck/i);
expectMatch('Você sente saudade?', /saudade|casa|família/i);
expectMatch('Você conhece terráqueos?', /horários|fim de semana/i);
expectMatch('Estou de bolinha?', /oficialmente de bolinha/i, { roster: { notes: 'Troca de tripulação / bolinha' } });
expectMatch('Partiu!', /CrewCheck|missão|operação/i);
expectMatch('Obrigado!', /junto|cuidar|conte comigo/i);
expectMatch('Tripulação, portas em automático, CrewCheck e confirmar', /automático|CrewCheck|confirmado/i);
expectMatch('Tripulação, portas em manual, CrewCheck e confirmar', /manual|CrewCheck|casa|jornada/i);

// Guardas: perguntas operacionais ou menções incidentais não podem cair nos Easter Eggs.
expectEmpty('Quem é o comandante do meu voo?');
expectEmpty('Minha esposa quer saber quando eu volto para casa');
expectEmpty('Hoje tenho bolinha e depois qual é o portão?');
expectEmpty('Qual é minha missão amanhã na escala?');
expectEmpty('Você pode verificar meu voo?');
expectEmpty('Obrigado por verificar qual é meu portão');
expectEmpty('Vamos começar a consulta da minha escala');
expectEmpty('Portas em automático e qual é o status do voo?');
expectEmpty('Você é um bot que consegue consultar METAR?');
expectEmpty('Quem te criou e qual é meu próximo voo?');

if (!source.includes('const easterEgg = conciergeEasterEggReply(value, profile, snapshot);')) {
  throw new Error('[v14.3.15] Easter Eggs não estão conectados ao fluxo do Concierge.');
}

console.log('[v14.3.15] CrewDNA Easter Eggs: identidade, família, humor, chamadas operacionais e guardas OK.');
