/**
 * #530 — atividades irmãs no mesmo dia civil não podem herdar o boundary uma
 * da outra.
 *
 * `server/rosterParser.mjs::parseAimsTokensIntoEventsV3` já emite UM evento por
 * código de atividade da coluna (HSB, ASB, CRM, ...). O defeito estava um nível
 * abaixo, em `pickDutyWindowFromAimsTokensV3`: a janela de cada atividade era
 * lida numa fatia de 18 tokens contada a partir do próprio código, SEM parar no
 * próximo código de atividade da mesma coluna. Quando o dia tem duas
 * programações independentes, a fatia da primeira atravessa a segunda e o
 * `end` vira o último horário do dia inteiro.
 *
 * Efeito observado em produção (registrado na #530): coluna
 * `HSB 03:00-07:00` + `ASB 08:30-14:30` produzia HSB `03:00 -> 14:30`. Às 08:50
 * o HSB — encerrado desde 07:00 — ainda contém o instante atual, então vence a
 * seleção temporal e permanece `Agora`; o ASB presencial nunca vira atual; e o
 * repouso seguinte aparece como `Próximo`. Um evento encerrado não pode
 * permanecer atual só por pertencer ao mesmo dia civil.
 *
 * A mesma fatia alimentava o `rawText` de cada irmã com a coluna inteira, de
 * modo que toda programação do dia carregava o código e os horários das outras.
 *
 * Casos sintéticos, escritos à mão. Não há fixture/oracle de corpus aqui e
 * nenhum é tocado. Os códigos usados (HSB/ASB/CRM/MT) são vocabulário público
 * de escala, não um usuário, data, base ou voo específico: a regra é validada
 * por estrutura — "duas atividades independentes na mesma coluna" — e o
 * segundo caso usa outra combinação de códigos e horários exatamente para que
 * o teste não fique preso ao par HSB/ASB do relato original.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempDir = fs.mkdtempSync(path.join('/tmp', 'crewcheck-530-sibling-window-'));
const src = fs.readFileSync(path.join(ROOT, 'server/rosterParser.mjs'), 'utf8');
assert.ok(src.includes('export { parsePdfOnServer };'), 'ponto de export esperado não encontrado — arquivo mudou de forma inesperada');

const tmpFile = path.join(tempDir, 'rosterParser.mjs');
fs.writeFileSync(tmpFile, src.replace(
  'export { parsePdfOnServer };',
  'export { parsePdfOnServer, parseAimsTokensIntoEventsV3 };',
));
const { parseAimsTokensIntoEventsV3 } = await import(pathToFileURL(tmpFile).href);

const DAY = 8;
const MONTH = 9;
const YEAR = 2026;

function parseColumn(tokens, base) {
  return parseAimsTokensIntoEventsV3(tokens, DAY, MONTH, YEAR, base);
}

function byCode(events, code) {
  const found = events.filter((event) => String(event.pairingCode).toUpperCase() === code);
  assert.equal(found.length, 1, `esperado exatamente um evento ${code} na coluna, veio ${found.length}`);
  return found[0];
}

function minutes(clock) {
  const [h, m] = String(clock).split(':').map(Number);
  return h * 60 + m;
}

/**
 * A mesma pergunta que o consumidor temporal faz: quais atividades contêm este
 * instante. Deliberadamente ingênua — o ponto é que o canônico só pode oferecer
 * UMA resposta, não que o consumidor saiba desempatar.
 */
function activitiesCovering(events, clock) {
  const now = minutes(clock);
  return events
    .filter((event) => event.dutyReport && event.dutyDebrief)
    .filter((event) => minutes(event.dutyReport) <= now && now <= minutes(event.dutyDebrief))
    .map((event) => String(event.pairingCode).toUpperCase());
}

// ---------------------------------------------------------------------------
// Caso 1 — o par relatado: sobreaviso domiciliar seguido de reserva presencial.
// ---------------------------------------------------------------------------
{
  const events = parseColumn(
    ['HSB', 'BSB', '03:00', 'BSB', '07:00', 'ASB', 'BSB', '08:30', 'BSB', '14:30'],
    'BSB',
  );

  const hsb = byCode(events, 'HSB');
  const asb = byCode(events, 'ASB');

  assert.equal(hsb.dutyReport, '03:00', 'HSB precisa manter a própria abertura');
  assert.equal(
    hsb.dutyDebrief,
    '07:00',
    'HSB precisa encerrar no próprio término publicado, não herdar o fim do ASB',
  );
  assert.equal(asb.dutyReport, '08:30', 'ASB precisa manter a própria apresentação');
  assert.equal(asb.dutyDebrief, '14:30', 'ASB precisa manter o próprio término');

  // Nenhuma atividade pode ser criada com janela que engula a irmã seguinte.
  assert.ok(
    minutes(hsb.dutyDebrief) <= minutes(asb.dutyReport),
    'a janela do HSB não pode invadir a abertura do ASB',
  );

  // Semântica Agora/Próximo derivada do canônico, sem consultar UI/Radar.
  assert.deepEqual(
    activitiesCovering(events, '08:50'),
    ['ASB'],
    'às 08:50 apenas o ASB está em andamento — HSB encerrado às 07:00 não pode continuar atual',
  );
  assert.deepEqual(
    activitiesCovering(events, '05:00'),
    ['HSB'],
    'às 05:00 apenas o HSB está em andamento',
  );
  assert.deepEqual(
    activitiesCovering(events, '07:45'),
    [],
    'entre o fim do HSB e a apresentação do ASB não há atividade em andamento',
  );
}

// ---------------------------------------------------------------------------
// Caso 2 — outra combinação de atividades não-voo no mesmo dia civil, para que
// a regra não fique amarrada ao par HSB/ASB do relato.
// ---------------------------------------------------------------------------
{
  const events = parseColumn(
    ['MT', 'CGH', '06:00', 'CGH', '10:00', 'CRM', 'CGH', '11:30', 'CGH', '17:45'],
    'CGH',
  );

  const training = byCode(events, 'MT');
  const crm = byCode(events, 'CRM');

  assert.equal(training.dutyReport, '06:00');
  assert.equal(training.dutyDebrief, '10:00', 'a primeira atividade não pode herdar o fim da segunda');
  assert.equal(crm.dutyReport, '11:30');
  assert.equal(crm.dutyDebrief, '17:45');

  assert.deepEqual(activitiesCovering(events, '12:00'), ['CRM']);
  assert.deepEqual(activitiesCovering(events, '10:45'), []);
}

// ---------------------------------------------------------------------------
// Caso 3 — três atividades independentes: a do meio também precisa ser exata.
// ---------------------------------------------------------------------------
{
  const events = parseColumn(
    ['HSB', 'REC', '01:00', 'REC', '05:00', 'MT', 'REC', '07:00', 'REC', '09:00', 'ASB', 'REC', '10:30', 'REC', '16:00'],
    'REC',
  );

  assert.equal(byCode(events, 'HSB').dutyDebrief, '05:00');
  assert.equal(byCode(events, 'MT').dutyReport, '07:00');
  assert.equal(byCode(events, 'MT').dutyDebrief, '09:00', 'a atividade do meio não pode absorver a terceira');
  assert.equal(byCode(events, 'ASB').dutyReport, '10:30');
  assert.equal(byCode(events, 'ASB').dutyDebrief, '16:00');

  for (const clock of ['02:00', '08:00', '11:00']) {
    assert.equal(
      activitiesCovering(events, clock).length,
      1,
      `${clock} deve pertencer a exatamente uma atividade`,
    );
  }
}

// ---------------------------------------------------------------------------
// Caso 4 — cada programação irmã carrega o próprio recorte de origem.
// ---------------------------------------------------------------------------
{
  const events = parseColumn(
    ['HSB', 'BSB', '03:00', 'BSB', '07:00', 'ASB', 'BSB', '08:30', 'BSB', '14:30'],
    'BSB',
  );

  const hsb = byCode(events, 'HSB');
  const asb = byCode(events, 'ASB');

  assert.ok(hsb.rawText, 'a atividade precisa preservar o texto de origem');
  assert.ok(/\bHSB\b/.test(hsb.rawText), 'o recorte do HSB precisa conter o próprio código');
  assert.ok(
    !/\bASB\b/.test(hsb.rawText),
    'o recorte do HSB não pode carregar o código da programação irmã',
  );
  assert.ok(
    !hsb.rawText.includes('14:30'),
    'o recorte do HSB não pode carregar horários da programação irmã',
  );
  assert.ok(/\bASB\b/.test(asb.rawText), 'o recorte do ASB precisa conter o próprio código');
  assert.ok(
    !/\bHSB\b/.test(asb.rawText),
    'o recorte do ASB não pode carregar o código da programação anterior',
  );
}

// ---------------------------------------------------------------------------
// Caso 5 — dia com uma única atividade continua idêntico: a correção recorta
// por irmã, não encurta a leitura de quem não tem irmã.
// ---------------------------------------------------------------------------
{
  const events = parseColumn(['ASB', 'GRU', '09:00', 'GRU', '15:00'], 'GRU');
  assert.equal(events.length, 1);
  assert.equal(events[0].dutyReport, '09:00');
  assert.equal(events[0].dutyDebrief, '15:00');
  assert.ok(/\bASB\b/.test(events[0].rawText));
}

// ---------------------------------------------------------------------------
// Caso 6 — a janela continua ausente (REVIEW) quando a fonte não publica
// horários. Ausência nunca pode virar dado inventado.
// ---------------------------------------------------------------------------
{
  const events = parseColumn(['HSB', 'ASB', 'BSB', '08:30', 'BSB', '14:30'], 'BSB');
  const hsb = byCode(events, 'HSB');
  assert.equal(hsb.dutyReport, null, 'HSB sem horário publicado não pode tomar emprestado o do ASB');
  assert.equal(hsb.dutyDebrief, null, 'HSB sem horário publicado precisa ficar em REVIEW');
  const asb = byCode(events, 'ASB');
  assert.equal(asb.dutyReport, '08:30');
  assert.equal(asb.dutyDebrief, '14:30');
}

// ---------------------------------------------------------------------------
// Caso 7 — a próxima programação também pode ser um bloco de voo. O sobreaviso
// domiciliar encerra no próprio término e não estica até a chegada da jornada.
// ---------------------------------------------------------------------------
{
  const events = parseColumn(
    ['HSB', 'BSB', '03:00', 'BSB', '07:00', 'LA', '3730', '09:25', '09:55', 'BSB', '10:30', 'GRU', '12:05'],
    'BSB',
  );

  const hsb = byCode(events, 'HSB');
  assert.equal(hsb.dutyReport, '03:00');
  assert.equal(hsb.dutyDebrief, '07:00', 'atividade não pode esticar até dentro do bloco de voo seguinte');
  assert.ok(!hsb.rawText.includes('LA'), 'o recorte da atividade não pode conter o bloco de voo seguinte');

  // A jornada de voo continua sendo emitida normalmente; o corte é da atividade.
  const flight = events.find((event) => String(event.pairingCode).toUpperCase().startsWith('LA'));
  assert.ok(flight, 'o bloco de voo da mesma coluna precisa continuar sendo emitido');
  assert.equal(activitiesCovering(events, '05:00').join(','), 'HSB');
  assert.equal(activitiesCovering(events, '08:00').length, 0, 'entre o fim do HSB e a apresentação do voo não há atividade em andamento');
}

// ---------------------------------------------------------------------------
// Caso 8 — MCK é emitido pelo complemento v14.3.75, não por esta função, mas
// continua sendo uma programação irmã: a atividade anterior não pode atravessá-lo.
// ---------------------------------------------------------------------------
{
  const events = parseColumn(
    ['ASB', 'CNF', '05:00', 'CNF', '09:00', 'MCK320', 'CNF', '10:00', 'CNF', '18:00'],
    'CNF',
  );
  const asb = byCode(events, 'ASB');
  assert.equal(asb.dutyDebrief, '09:00', 'a atividade não pode herdar o término do bloco MCK seguinte');
  assert.ok(!/MCK/.test(asb.rawText), 'o recorte da atividade não pode conter o bloco MCK seguinte');
}

fs.rmSync(tempDir, { recursive: true, force: true });
console.log('OK regression-p0-530-sibling-activity-duty-window');
