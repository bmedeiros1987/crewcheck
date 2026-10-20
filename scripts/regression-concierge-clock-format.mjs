import assert from 'node:assert/strict';
import test from 'node:test';
import {
  conciergeFormatTextV14354 as format,
  conciergeFinalizeReplyV14354 as finalize,
  CONCIERGE_OFFICIAL_ROSTER_NOTICE_V14354 as notice,
} from '../server/v14354/concierge-language.mjs';
import {
  spokenTime,
  premiumVoiceText,
  buildProgramSummary,
} from '../server/v1404/telegram-language.mjs';
import { conciergeHumanizeReplyV14408, conciergeVoiceScriptV14408 } from '../server/v14408/concierge-human.mjs';

const pad = (value) => String(value).padStart(2, '0');
test('every valid minute survives the real spokenTime → text → voice round trip', () => {
  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += 1) {
      const hhmm = `${pad(hour)}:${pad(minute)}`;
      const expected = `Apresentação às ${hhmm}.`;
      const text = format(`Apresentação às ${spokenTime(hhmm)}.`);
      assert.equal(text, expected, hhmm);
      assert.equal(format(text), text, `text idempotence ${hhmm}`);
      assert.equal(format(premiumVoiceText(text)), text, `voice round trip ${hhmm}`);
      assert.equal(premiumVoiceText(premiumVoiceText(text)), premiumVoiceText(text), `voice idempotence ${hhmm}`);
    }
  }
});

test('compound, accented, numeric and special clock forms remain atomic', () => {
  for (const [source, expected] of [
    ['Saia às vinte e uma horas e 7 minutos.', 'Saia às 21:07.'],
    ['Voo às vinte e duas horas e quarenta minutos.', 'Voo às 22:40.'],
    ['Voo às vinte e três horas e cinquenta e nove minutos.', 'Voo às 23:59.'],
    ['Às vinte e uma horas.', 'às 21:00.'],
    ['(as três horas e um minuto)', '(às 03:01)'],
    ['Apresentação às onze e trinta.', 'Apresentação às 11:30.'],
    ['Apresentação às vinte e uma e sete.', 'Apresentação às 21:07.'],
    ['Apresentação às vinte e uma horas e vinte e três minutos.', 'Apresentação às 21:23.'],
    ['as meio dia e 7 minutos', 'às 12:07'],
    ['às meia-noite e quarenta minutos', 'às 00:40'],
    ['às meia noite', 'às 00:00'],
    ['as 7:30', 'às 07:30'],
    ['Saia as 7h.', 'Saia às 07:00.'],
    ['Saia as 7horas.', 'Saia às 07:00.'],
    ['as 21 horas e 7 minutos', 'às 21:07'],
    ['as 1 h e 1 min', 'às 01:01'],
  ]) {
    assert.equal(format(source), expected, source);
    assert.equal(format(format(source)), expected, `idempotence ${source}`);
  }
});

test('ambiguous, out-of-range and unrelated text is never repaired into a valid clock', () => {
  for (const source of ['às vinte e uma', 'às vinte e duas', 'às vinte e três', 'às 24:00', 'as 25:61', 'às 12:99', 'às 12:999', 'às 123:12', 'às 12:30:59', 'a las veintidós y cuarenta', 'at twenty-one hours and seven minutes', 'Flight LA3123 at 21:07, vuelo AD0007 a las 22:40.', 'METAR SBBR 291200Z 09005KT CAVOK']) {
    assert.equal(format(source), source);
    assert.equal(format(format(source)), source);
  }
  for (const source of ['às vinte e quatro horas', 'às vinte e uma horas e sessenta minutos', 'às onze horas e duas etapas', 'às onze e trinta dias']) {
    const result = format(source);
    assert.doesNotMatch(result, /\d{2}:\d{2}/, source);
    assert.equal(format(result), result);
  }
});

test('flight IDs, durations, count normalization and roster notices are preserved', () => {
  for (const [source, expected] of [
    ['LA três sete três zero · um voos · uma etapas', 'LA3730 · 1 voo · 1 etapa'],
    ['AD zero zero um dois às vinte e uma horas e 7 minutos', 'AD0012 às 21:07'],
    ['G3 um dois três quatro às vinte e duas horas', 'G31234 às 22:00'],
    ['Faltam vinte e cinco minutos e duas horas de janela.', 'Faltam 25 min e 2 h de janela.'],
    ['A programação começa em um minutos.', 'A programação começa em 1 min.'],
    ['Radar\nQualidade da consulta: 82% · 3 fontes úteis\nPortão A12', 'Radar\nPortão A12'],
  ]) assert.equal(format(source), expected);
  const text = finalize('LA3730 às vinte e uma horas e 7 minutos.', '/proximo');
  assert.equal(text, `LA3730 às 21:07.\n\n${notice}`);
  assert.equal(finalize(text, '/proximo'), text);
  assert.doesNotMatch(finalize('METAR SBBR 291200Z', '/metar SBBR raw'), /escala oficial/);
});

test('real program summary and text/voice finalizers keep departure and arrival clocks', () => {
  const summary = buildProgramSummary({
    profile: { name: 'Teste' },
    record: { startTime: '20:00', endTime: '23:59', legs: [{ flightNumber: 'LA3123', origin: 'GRU', destination: 'BSB', departureTime: '21:07', arrivalTime: '22:40' }] },
    presentationTime: '20:00', label: 'Hoje',
  });
  const text = conciergeHumanizeReplyV14408(finalize(summary, '/hoje'), '/hoje');
  for (const time of ['20:00','21:07','22:40','23:59']) assert.ok(text.includes(time), text);
  const voice = premiumVoiceText(conciergeVoiceScriptV14408(text, '/hoje'));
  const normalizedVoice = format(voice);
  for (const time of ['20:00','21:07','22:40','23:59']) assert.ok(normalizedVoice.includes(time), normalizedVoice);
});

