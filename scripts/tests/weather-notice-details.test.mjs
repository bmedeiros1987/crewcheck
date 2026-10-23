import assert from 'node:assert/strict';
import test from 'node:test';
import { formatWeatherNoticeDetails as format } from '../../shared/weatherNoticeDetails.mjs';

const report = (body = '02015G30KT 9000 -RA BKN042', extra = {}) => ({
  raw: `METAR SBGR 221000Z ${body} 23/20 Q1014`, observedAt: '2026-10-22T10:00:00Z', station: 'SBGR', ...extra,
});
test('first/current values, never an invented before/after delta', () => {
  assert.equal(format(report()), 'Vento 020°: 15 kt · rajadas 30 kt · chuva leve · visibilidade 9000 m · teto 4200 pés · METAR 22/10/2026 10:00 UTC');
  for (const gust of [24, 25, 30, 40, 20]) {
    const detail = format(report(`02020G${gust}KT 9999`));
    assert.match(detail, new RegExp(`rajadas ${gust} kt`));
    assert.doesNotMatch(detail, /aument|caiu|melhor|pior|→/);
  }
});
test('calm requires the explicit calm token and absent gust is not measured zero', () => {
  assert.match(format(report('00000KT CAVOK')), /Vento calmo \(0 kt\)/);
  for (const body of ['', '/////KT', 'VRB00KT', '00010KT', '02000KT', 'NaN', 'null']) {
    assert.doesNotMatch(format(report(body)), /vento|rajadas|calmo/i);
  }
  assert.doesNotMatch(format(report('02015KT 9999')), /rajadas/);
});
test('VRB, directional wind and supported units remain exact', () => {
  assert.match(format(report('VRB15G30KT 9999')), /Vento variável: 15 kt · rajadas 30 kt/);
  assert.match(format(report('36030KT 9999')), /Vento 360°: 30 kt/);
  for (const unit of ['MPS', 'KMH']) assert.doesNotMatch(format(report(`02015G30${unit} 9999`)), /vento|rajadas|kt/i);
  assert.doesNotMatch(format(report('99915G30KT 9999')), /vento|rajadas/i);
});
for (const [token, expected] of Object.entries({ TS: 'trovoada', TSRA: 'trovoada com chuva', '+TSRA': 'trovoada com chuva forte', '-TSRA': 'trovoada com chuva leve', VCTS: 'trovoada nas proximidades', VCTSRA: 'trovoada com chuva nas proximidades', RA: 'chuva', '+RA': 'chuva forte', '-RA': 'chuva leve', FG: 'nevoeiro', BR: 'névoa úmida', FZRA: 'chuva congelante', FZDZ: 'chuvisco congelante', FZFG: 'nevoeiro congelante', SN: 'neve', SHSN: 'pancadas de neve', BLSN: 'neve soprada', GR: 'granizo', VA: 'cinzas vulcânicas', SQ: 'rajadas súbitas', FC: 'nuvem funil/tromba', '+FC': 'tornado/tromba', WS: 'cortante de vento' })) {
  test(`supported present-weather token ${token}`, () => assert.ok(format(report(`02015KT 5000 ${token}`)).includes(expected)));
}
for (const suffix of ['RMK TSRA 03040G50KT', 'TEMPO TSRA 03040G50KT', 'BECMG TSRA', 'TREND TSRA', 'NOSIG RMK TSRA', 'TAF SBGR 221000Z TSRA', 'PROB30 TSRA', 'FM1200 TSRA', 'FM221200 TSRA', 'AT1200 TSRA', 'TL1200 TSRA', 'RETS RETSRA RERA']) {
  test(`not current observed weather: ${suffix}`, () => {
    const detail = format(report(`02015KT 9999 ${suffix}`));
    assert.doesNotMatch(detail, /trovoada|rajadas|40 kt|50 kt/);
  });
}
test('visibility limits and ceiling are not exact or unlimited inventions', () => {
  for (const visibility of ['9999', 'CAVOK']) assert.match(format(report(`02015KT ${visibility}`)), /visibilidade ≥10 km/);
  assert.match(format(report('02015KT 0000')), /visibilidade <50 m/);
  assert.match(format(report('02015KT 1500 BKN008 OVC015')), /visibilidade 1500 m · teto 800 pés/);
  assert.match(format(report('02015KT 3000 BKN020CB')), /teto 2000 pés · cumulonimbus/);
  for (const body of ['02015KT FEW020 SCT030', '02015KT BKN///', '02015KT BKN/// OVC015', '02015KT BKN000', '02015KT OVC000CB BKN010', '02015KT 1/2SM', '02015KT R09/0200']) assert.doesNotMatch(format(report(body)), /teto|visibilidade|ilimitad/);
});
test('corrected same-minute reports do not invent elapsed time or worsening', () => {
  const detail = format(report('COR 02015G40KT 9999', { raw: 'SPECI COR SBGR 221000Z 02015G40KT 9999' }));
  assert.match(detail, /rajadas 40 kt.*SPECI COR 22\/10\/2026 10:00 UTC/);
  assert.doesNotMatch(detail, /aument|→/);
});
test('full date must match the raw group; raw-only never borrows retrieval/current month', () => {
  for (const observedAt of [undefined, null, NaN, '', 'invalid', '2026-10-22T10:01:00Z', '2026-10-22T10:00:00']) {
    assert.match(format(report(undefined, { observedAt, cachedAt: '2026-11-01T12:00:00Z' })), /METAR dia 22 10:00 UTC$/);
  }
  const raw = 'METAR SBGR 302345Z 02015G30KT 9999';
  assert.match(format({ raw, observedAt: '2026-09-30T23:45:00Z' }), /30\/09\/2026 23:45 UTC/);
  for (const observedAt of [1792663200, 1792663200000, '1792663200', '2026-10-22T07:00:00-03:00']) assert.match(format(report(undefined, { observedAt })), /22\/10\/2026 10:00 UTC/);
});
test('invalid input and TAF cannot masquerade as METAR, payload extras never enter copy', () => {
  for (const raw of [null, NaN, {}, '', 'TAF SBGR 221000Z 2212/2312 TSRA', '<html>TSRA</html>', 'METAR SBGR 321000Z TS', 'METAR SBGR 222500Z TS', 'X'.repeat(4097)]) assert.equal(format({ raw }), 'Detalhes observados indisponíveis');
  assert.equal(format(report(undefined, { station: 'SBFL' })), 'Detalhes observados indisponíveis');
  assert.equal(format(report(undefined, { taf: 'TSRA', monitoring: { windKt: 0 }, account: 'PRIVATE-SENTINEL', source: 'PRIVATE-SENTINEL' })), format(report()));
});
test('deterministic bounded one-line copy ignores locale and arbitrary unknown tokens', () => {
  const input = report(`360125G199KT 9999 +TSRA VCTSRA FZRA FG BR VA BKN001CB ${'UNKNOWN '.repeat(100)}`);
  const detail = format(input);
  assert.ok(detail.length < 360, String(detail.length));
  assert.doesNotMatch(detail, /\n|UNKNOWN/);
  assert.equal(format(input), detail);
});
