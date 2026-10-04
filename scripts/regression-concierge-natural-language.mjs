import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { premiumGreeting, preferredUserName, premiumVoicePolicy } from '../server/v1403/telegram-human.mjs';
import { buildProgramSummary, buildBlankDaySummary, premiumVoiceText } from '../server/v1404/telegram-language.mjs';
import { conciergeFinalizeReplyV14354 as finalize, conciergeFormatTextV14354 as format } from '../server/v14354/concierge-language.mjs';
import { conciergeHumanizeReplyV14408 as humanize, conciergeVoiceScriptV14408 as voice, CONCIERGE_COMPACT_ROSTER_NOTICE_V14408 as notice } from '../server/v14408/concierge-human.mjs';
import { decorateConciergeReply, conciergeHumorEligible } from '../server/v14336/concierge-personality.mjs';

// All identities, dates, flights, values and locations below are synthetic.
const profile = { name: 'ANA EXEMPLO', role: 'CCM' };
const roster = { days: [{ legs: [{ destination: 'MAB' }, { destination: 'MAB' }] }] };
const now = new Date('2026-09-01T12:00:00Z');
const render = (reply, query, mode = 'formal') => humanize(finalize(decorateConciergeReply(reply, {
  preferences: { mode }, roster, now, random: () => 0,
}).reply, query), query);

function easterEggReplies(source, query) {
  const helperNames = ['conciergeEasterEggNormalize', 'conciergeEasterEggPick', 'conciergeEasterEggReply'];
  const helpers = helperNames.map((name) => {
    const start = source.indexOf(`function ${name}(`);
    const end = source.indexOf('\n}', start);
    assert.ok(start >= 0 && end > start, `missing ${name}`);
    return source.slice(start, end + 2);
  }).join('\n');
  const context = vm.createContext({});
  vm.runInContext(`${helpers}\nthis.reply = conciergeEasterEggReply; this.variants = [];
    conciergeEasterEggPick = (options) => { this.variants = [...options]; return options[0]; };`, context);
  const first = context.reply(query, {}, null);
  return context.variants.length ? [...context.variants] : [first];
}

const snippet = fs.readFileSync('server/v1403/build-reply.snippet', 'utf8');

test('greetings use imported first names and preserve explicitly chosen aliases without mutating preferences', () => {
  assert.equal(premiumGreeting(profile), 'Olá, Ana.');
  assert.equal(premiumGreeting({ name: 'JOÃO EXEMPLO', role: 'CMTE' }), 'Olá, João.');
  assert.equal(premiumGreeting({ name: 'ÉRICA EXEMPLO' }), 'Olá, Érica.');
  assert.equal(premiumGreeting({ name: 'ANA-MARIA EXEMPLO' }), 'Olá, Ana-Maria.');
  assert.equal(premiumGreeting({ name: "D’ÁVILA EXEMPLO" }), 'Olá, D’Ávila.');
  assert.equal(premiumGreeting(), 'Olá.');
  assert.equal(premiumGreeting({ name: 'Outro' }, { roster: { crewName: 'LIA EXEMPLO' } }), 'Olá, Lia.');
  for (const [alias, expected] of [['Ana Clara', 'Ana Clara'], ['ANA CLARA', 'Ana Clara'], ['McKay', 'McKay'], ['Li', 'Li']]) {
    const snapshot = { preferences: { preferredName: alias, mode: 'comic' } };
    const before = JSON.stringify(snapshot);
    assert.equal(premiumGreeting(profile, snapshot), `Olá, ${expected}.`);
    assert.equal(preferredUserName(profile, snapshot), alias, 'stored display name contract is unchanged');
    assert.equal(JSON.stringify(snapshot), before);
  }
});

test('answers and follow-ups lead with the answer, while greeting requests keep their greeting', () => {
  const reply = `${premiumGreeting(profile)} Sua apresentação é às 09:25.`;
  for (const query of ['que horas é minha apresentação?', 'e a apresentação?', '/hoje']) {
    assert.equal(humanize(reply, query), `Sua apresentação é às 09:25.\n\n${notice}`);
    assert.equal(humanize(humanize(reply, query), query), humanize(reply, query));
  }
  assert.equal(humanize('Fala, chefe ANA EXEMPLO. Portão A12.', 'e o portão?'), `Portão A12.\n\n${notice}`);
  for (const query of ['oi', 'olá!', 'bom dia', '/start', '/help@crewcheck']) assert.equal(humanize(reply, query), reply);
  assert.equal(humanize('Olá.', 'oi'), 'Olá.');
  assert.equal(humanize('Olá, Ana. hoje, sua folga termina às 17:00.', 'hoje'), 'Hoje, sua folga termina às 17:00.');
  // Do not partially remove dotted aliases, greetings quoted as data, or arbitrary prose.
  for (const value of ['Olá, A. Exemplo. Sua apresentação é às 09:25.', 'Olá, Dra. Ana. Sua apresentação é às 09:25.', 'Olá, Ana P. Exemplo. Sua apresentação é às 09:25.', 'Mensagem: “Fala, chefe ANA.”', 'https://example.com/voo?hora=09:25', 'nome: ANA EXEMPLO', 'abc123']) assert.equal(humanize(value, ''), value);
});

test('missing details and errors use one specific request without inventing data or promises', () => {
  assert.equal(humanize('Não identifiquei qual detalhe você quer continuar. Diga apenas o dado: apresentação, saída, portão, hotel, meteorologia ou próxima programação.', 'e aquilo?'), 'Qual detalhe você quer consultar?');
  const missing = humanize(`${premiumGreeting(profile)} Ainda não tenho uma escala ativa. Envie o PDF oficial ou sincronize a escala pelo app.`, '/hoje');
  assert.equal(missing, `Ainda não encontrei uma escala ativa. Envie o PDF oficial ou sincronize a escala pelo app para eu consultar.\n\n${notice}`);
  assert.equal(humanize('ElevenLabs aguardando configuração.', ''), 'O áudio ainda não está configurado.');
  assert.equal(humanize('Não foi possível consultar o Radar. Tente novamente.', 'radar'), 'Não foi possível consultar o Radar. Tente novamente.');
  const fallback = snippet.match(/return '(Não entendi exatamente[^']+)';/)?.[1];
  assert.ok(fallback, 'test must exercise the current real fallback template');
  const result = humanize(fallback, 'uma consulta que não reconheço');
  assert.equal(result, 'O que você quer consultar? Pode perguntar sobre a escala, voos ou lugares.');
  assert.equal((result.match(/\?/g) || []).length, 1);
  assert.equal(premiumVoicePolicy(missing, 'o que tenho hoje?').allowed, false, 'missing data remains text-only');
  for (const mode of ['formal', 'comic']) {
    assert.equal(render('Não identifiquei qual detalhe você quer continuar. Diga apenas o dado: apresentação, saída, portão, hotel, meteorologia ou próxima programação.', 'e aquilo?', mode), 'Qual detalhe você quer consultar?');
    assert.equal(render('ElevenLabs aguardando configuração.', '', mode), 'O áudio ainda não está configurado.');
  }
});

test('formal and light modes keep operational facts and do not add humor to questions or warnings', () => {
  const safe = 'Próxima programação: AD0012 · GRU → MAB · apresentação 09:25.';
  assert.doesNotMatch(render(safe, '/proximo', 'formal'), /Marabá|Marabalas/);
  assert.match(render(safe, '/proximo', 'comic'), /Marabá|Marabalas/);
  assert.ok(render(safe, '/proximo', 'comic').startsWith(safe));
  for (const text of [
    'Alerta crítico: não embarque. Confirme imediatamente com a operação.',
    'Não posso confirmar portas em automático. Siga os procedimentos da empresa e a confirmação da tripulação.',
    'Sem dados para confirmar. Não assuma que é folga.',
    'Erro na consulta. Não foi possível confirmar o resultado.',
    'Qual detalhe você quer consultar?',
    'O que você quer consultar? Pode perguntar sobre a escala, voos ou lugares.',
  ]) {
    assert.equal(conciergeHumorEligible(text), false, text);
    for (const mode of ['formal', 'comic']) assert.equal(render(text, '', mode), text);
  }
});

test('text keeps dates, values, negation, links, repeated rows and complete safety instructions', () => {
  const source = [
    '04/09/2026 · AD0012 · GRU → MAB · 09:25 · 11:05 · portão A12.',
    'Valor estimado: R$ 1.234,56. Não é valor confirmado.',
    'Não há hotel confirmado.',
    '05/09/2026',
    'Não há hotel confirmado.',
    'Fonte: https://example.com/consulta?voo=AD0012&data=2026-09-04',
    'O horário pode mudar conforme a operação; confirme no Radar e na escala oficial.',
    'Confirme sempre a escala oficial e as comunicações da empresa. Não embarque sem autorização.',
  ].join('\n');
  const output = humanize(`${premiumGreeting(profile)} ${source}`, 'resumo');
  assert.equal(output, source);
  const oneNotice = humanize(`Resultado.\n${notice}\n${notice}`, '/hoje');
  assert.equal(oneNotice, `Resultado.\n\n${notice}`);
  assert.equal(humanize(oneNotice, '/hoje'), oneNotice);
});

test('raw aviation bulletins remain byte-identical and ordinary blank-day warnings remain visible', () => {
  for (const [query, raw] of [['/metar SBBR raw', 'METAR SBBR 011200Z 09005KT CAVOK'], ['/taf SBGR raw', 'TAF SBGR 011100Z 0112/0212 09005KT CAVOK'], ['/atis SBBR raw', 'ATIS SBBR INFORMATION A 1200Z']]) assert.equal(humanize(raw, query), raw);
  const blank = humanize(buildBlankDaySummary({ profile, label: 'Hoje' }), '/hoje');
  assert.match(blank, /^Hoje, seu dia está em branco/);
  assert.match(blank, /Confirme com a escala antes de assumir que é folga/);
});

test('short voice scripts preserve times, negation and warnings without reading URLs', () => {
  for (const mode of ['formal', 'comic']) {
    const summary = buildProgramSummary({ profile, snapshot: { preferences: { mode } }, label: 'Hoje', presentationTime: '09:25', record: { startTime: '09:25', endTime: '13:45', legs: [{ flightNumber: 'AD0012', origin: 'GRU', destination: 'BSB', departureTime: '11:05', arrivalTime: '12:40' }] } });
    const text = render(summary, '/hoje', mode);
    const spoken = premiumVoiceText(voice(text, '/hoje'));
    for (const time of ['09:25', '11:05', '12:40', '13:45']) assert.ok(format(spoken).includes(time), `${mode}: ${time}`);
    assert.match(spoken, /zero zero um dois/);
    assert.doesNotMatch(spoken, /Fala,|chefe ANA|Olá,/);
    const warning = render('Alerta crítico: voo não confirmado. Não embarque sem autorização. https://example.com/status', '', mode);
    assert.match(voice(warning, ''), /Alerta crítico: voo não confirmado\. Não embarque sem autorização\./);
    assert.doesNotMatch(voice(warning, ''), /https:/);
  }
});

test('every personal and cabin-procedure reply is truthful, including after canonical materialization', () => {
  const sources = [snippet];
  if (process.env.CREWCHECK_TEST_PREPARED === '1') sources.push(fs.readFileSync('server.mjs', 'utf8'));
  for (const source of sources) {
    for (const query of ['você é um bot?', 'você é humano?', 'você é casado?', 'você tem filhos?', 'você sonha?', 'você sente saudade?', 'você me ama?']) {
      for (const reply of easterEggReplies(source, query)) {
        assert.ok(reply, query);
        assert.doesNotMatch(reply, /Sou casado|Tenho uma filha|Tenho, sim|Meu sonho é|Talvez daquilo que todo tripulante/);
        assert.match(reply, /assistente virtual|não tenho|Não tenho|não sinto|Não sinto/);
      }
    }
    for (const query of ['fechar portas', 'portas em automático CrewCheck e confirmar', 'portas em manual']) {
      for (const reply of easterEggReplies(source, query)) {
        assert.match(reply, /Não (?:consigo|tenho acesso|posso)/);
        assert.match(reply, /procedimentos da empresa/);
        assert.doesNotMatch(reply, /realizado e confirmado|Tudo conferido|conferido dos dois lados|Cabine pronta|encerrada com segurança/);
        for (const mode of ['formal', 'comic']) assert.equal(render(reply, '', mode), reply);
      }
    }
    for (const reply of easterEggReplies(source, 'partiu')) assert.doesNotMatch(reply, /portas|Tudo conferido|confirmado/);
    for (const reply of easterEggReplies(source, 'obrigado')) assert.match(reply, /^(?:Por nada|De nada)/);
    for (const query of ['minha esposa quer saber quando volto', 'portas em automático e qual é o status do voo?', 'obrigado por verificar meu portão']) assert.deepEqual(easterEggReplies(source, query), ['']);
  }
});
