#!/usr/bin/env node
/*
 * Gera o mostrador WFF de QA "CrewWatch · Painel de Voo" a partir do protótipo
 * design/crewwatch/crewwatch.html (direção Painel de Voo / O dia no pulso).
 *
 * As camadas estáticas de cada estado são renderizadas pela própria função
 * painel() do protótipo (Chromium/Playwright), sem os dígitos da hora e sem a
 * linha de data. Os dígitos (placas) e a data são recortados da mesma
 * renderização, na mesma posição, e montados no relógio por Condition sobre
 * [HOUR_0_23], [MINUTE], [DAY], [MONTH], [DAY_OF_WEEK] e [UTC_TIMESTAMP].
 * Todos os dados operacionais são fictícios (DEMO).
 *
 * Uso: node design/crewwatch/wff-qa/tools/generate.cjs
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HTML = path.resolve(ROOT, '..', 'crewwatch.html');
const RES = path.join(ROOT, 'src', 'main', 'res');
const DRAW = path.join(RES, 'drawable-nodpi');
const RAW = path.join(RES, 'raw');

const TILE_X = [100, 160, 236, 296], TILE_Y = 110, TILE_W = 54, TILE_H = 88;
const SHORTCUTS = [ // ângulo e destino do toque (posições do protótipo, r = 172)
  { id: 'escala', a: 287, target: 'com.crewcheck.app/com.crewcheck.watch.MainActivity' },
  { id: 'saida', a: 253, target: 'com.crewcheck.app/com.crewcheck.watch.MainActivity' },
  { id: 'despertador', a: 73, target: 'ALARM' },
  { id: 'alertas', a: 107, target: 'com.crewcheck.app/com.crewcheck.watch.MainActivity' },
];
const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']; // [DAY_OF_WEEK] 1 = domingo
const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const F = "font-family:'Google Sans Flex','Roboto Flex','Inter','SF Pro Display','Segoe UI',system-ui,sans-serif;font-variant-numeric:tabular-nums";

function clean() {
  fs.mkdirSync(DRAW, { recursive: true });
  fs.mkdirSync(RAW, { recursive: true });
  for (const f of fs.readdirSync(DRAW)) if (f.startsWith('cw_')) fs.unlinkSync(path.join(DRAW, f));
}

(async () => {
  clean();
  const browser = await chromium.launch();
  const proto = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await proto.goto('file://' + HTML);
  await proto.waitForTimeout(300);

  // ---- estados, exatamente como o protótipo os monta
  const specs = await proto.evaluate((F) => {
    const lav = { ...THEMES.glaciar, acc: '#B7B0FF', acc2: '#6B5BE0', tint: '#14131f' };
    const list = DAY.map((d, i) => ({ key: 's' + i, name: d.name, o: { ...fb, ...d, alerts: 0, theme: i === 8 ? lav : THEMES.glaciar } }));
    list.push({ key: 'a_gate', name: 'Alerta · Portão alterado', o: { ...fb, time: '11:35', utc: '14:35Z', p: .47, gate: 'C04', oldGate: 'B12', status: { kind: 'warn', lines: ['PORTÃO', 'ALTERADO'] } } });
    list.push({ key: 'a_delay', name: 'Alerta · Atraso +25 min', o: { ...fb, time: '11:40', utc: '14:40Z', p: .42, dep: '12:45', newDep: true, board: '12:15', oldBoard: '11:50', status: { kind: 'warn', lines: ['ATRASO', '+25 MIN'] } } });
    list.push({ key: 't_limit', name: 'Trânsito · Chega no limite', o: { ...tr, p: .39, top1: trTop(6, AMBER),
      cols: [{ l: 'CHEGADA', v: '06:39', big: 1, old: '06:33' }, { l: 'FOLGA', v: '6', u: 'min', old: '12' }, { l: 'STATUS', st: 1 }], status: { kind: 'limit', lines: ['CHEGA', 'NO LIMITE'] } } });
    list.push({ key: 't_late', name: 'Trânsito · Vai atrasar', o: { ...tr, p: .31, top1: trTop(17, AMBER_STRONG),
      cols: [{ l: 'CHEGADA', v: '06:50', big: 1, old: '06:33', col: AMBER_STRONG }, { l: 'FOLGA', v: '−5', u: 'min', old: '12', col: AMBER_STRONG }, { l: 'STATUS', st: 1 }], status: { kind: 'late', lines: ['VAI', 'ATRASAR'] } } });

    const stripDate = (s) => s.replace(/<text x="225" y="221"[\s\S]*?<\/text>/, '');
    // AOD: só o arco a 40 %, a coluna 1 e (fora daqui) os dígitos; sem textura nem placas.
    const aod = (o) => {
      const st = o.status, A = ['warn', 'limit', 'late'].includes(st.kind), acc = A ? AMBER : o.theme.acc;
      const R = 202, a1 = 270 + o.p * 180, [mx, my] = P(R, a1);
      const c = (o.cols || [{ l: 'PORTÃO', v: o.gate, big: 1, old: o.oldGate }])[0];
      const fs = c.big ? (String(c.v).length > 3 ? 27 : 34) : 22, col = c.col || (c.old ? AMBER : '#C9D1D9');
      return `<svg viewBox="0 0 450 450" width="450" height="450" xmlns="http://www.w3.org/2000/svg" style="${F}">
        <path d="${arc(R, 270, 90)}" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="2" stroke-linecap="round"/>
        ${o.p > 0 ? `<path d="${arc(R, 270, a1)}" fill="none" stroke="${acc}" stroke-opacity=".4" stroke-width="3.6" stroke-linecap="round"/>` : ''}
        <circle cx="${mx}" cy="${my}" r="4" fill="#000" stroke="${acc}" stroke-opacity=".55" stroke-width="1.6"/>
        <circle cx="225" cy="141" r="3.6" fill="${o.theme.acc}" fill-opacity=".8"/><circle cx="225" cy="167" r="3.6" fill="${o.theme.acc}" fill-opacity=".8"/>
        <text x="134" y="254" text-anchor="middle" font-size="9" font-weight="700" letter-spacing="1.6" fill="#6E7884">${c.l}</text>
        <text x="134" y="290" text-anchor="middle" font-size="${fs}" font-weight="700" letter-spacing=".5" fill="${col}" fill-opacity=".85">${c.v}${c.u ? `<tspan font-size="14" font-weight="600" fill="#6E7884"> ${c.u}</tspan>` : ''}</text></svg>`;
    };
    const out = list.map(({ key, name, o }) => ({
      key, name, lav: o.theme === lav, acc: o.theme.acc,
      bg: stripDate(painel({ ...o, id: 'bg' + key, time: '    ' })),
      aod: aod(o),
    }));
    // placas com dígitos: tema Glaciar (Apresentação) e tema Lavanda (Repouso)
    const digits = {};
    for (const [set, base] of [['c', list[3].o], ['l', list[8].o]])
      digits[set] = [...Array(10).keys()].map((d) => painel({ ...base, id: 'dg' + set + d, time: `${d}${d}:${d}${d}` }));
    const preview = painel({ ...fb, id: 'pv', time: '10:09', date: 'SEX 20 NOV', utc: '13:09Z' });
    return { states: out, digits, preview, lavAcc: lav.acc, glaAcc: THEMES.glaciar.acc };
  }, F);

  // ---- página limpa para rasterizar (fundo transparente)
  const r = await browser.newPage({ viewport: { width: 450, height: 450 }, deviceScaleFactor: 1 });
  const raster = async (svg, file, clip, css = '') => {
    await r.setContent(`<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block;width:450px;height:450px;${css}}</style></head><body>${svg}</body></html>`);
    await r.evaluate(() => document.fonts.ready);
    await r.screenshot({ path: path.join(DRAW, file + '.png'), omitBackground: true, clip: clip || { x: 0, y: 0, width: 450, height: 450 } });
  };
  const files = [];
  const save = async (svg, name, clip, css) => { await raster(svg, name, clip, css); files.push(name); };

  for (const s of specs.states) {
    await save(s.bg, `cw_bg_${s.key}`);
    await save(s.aod, `cw_aod_${s.key}`);
  }
  await save(specs.preview, 'cw_preview');

  // placas: recorte de cada posição com cantos arredondados (rx 7)
  const tileClip = (i) => ({ x: TILE_X[i], y: TILE_Y, width: TILE_W, height: TILE_H });
  const tileCss = (i) => `clip-path:inset(${TILE_Y}px ${450 - TILE_X[i] - TILE_W}px ${450 - TILE_Y - TILE_H}px ${TILE_X[i]}px round 7px)`;
  const TENS = [3, 10, 6, 10];
  for (let d = 0; d < 10; d++) {
    for (let i = 0; i < 4; i++) {
      if (d >= TENS[i]) continue;
      if (i < 2) await save(specs.digits.c[d], `cw_t${i}_w_${d}`, tileClip(i), tileCss(i));
      else for (const set of ['c', 'l']) await save(specs.digits[set][d], `cw_t${i}_${set}_${d}`, tileClip(i), tileCss(i));
    }
  }
  // dígitos do AOD (sem placa)
  const glyph = (d, fill, x) => `<svg viewBox="0 0 450 450" xmlns="http://www.w3.org/2000/svg" style="${F}"><text x="${x + 27}" y="${TILE_Y + 71}" text-anchor="middle" font-size="76" font-weight="600" fill="${fill}">${d}</text></svg>`;
  for (let d = 0; d < 10; d++) {
    await save(glyph(d, '#D5DAE0', TILE_X[1]), `cw_g_w_${d}`, tileClip(1));
    await save(glyph(d, specs.glaAcc, TILE_X[3]), `cw_g_c_${d}`, tileClip(3));
    await save(glyph(d, specs.lavAcc, TILE_X[3]), `cw_g_l_${d}`, tileClip(3));
  }

  // ---- linha de data "QUA 20 NOV · 13:09Z" com a tipografia do protótipo
  const MUT = '#8C97A3', FAINT = '#56606A', REF = 'QUA 20 NOV · 13:09Z';
  const lineSvg = (inner, anchor = 'middle', x = 225) => `<svg viewBox="0 0 450 450" xmlns="http://www.w3.org/2000/svg" style="${F}"><text id="t" x="${x}" y="221" text-anchor="${anchor}" font-size="10.5" font-weight="600" letter-spacing="1.8" fill="${MUT}">${inner}</text></svg>`;
  const refInner = (chars, visible) => chars.map((ch, i) => `<tspan fill="${visible(i) ? (i === 11 ? FAINT : MUT) : 'transparent'}">${ch}</tspan>`).join('');
  await r.setContent(`<!doctype html><html><body style="margin:0">${lineSvg(refInner([...REF], () => true))}</body></html>`);
  await r.evaluate(() => document.fonts.ready);
  const pos = await r.evaluate((n) => { const t = document.getElementById('t'); return [...Array(n).keys()].map((i) => t.getStartPositionOfChar(i).x); }, REF.length);
  const LY = 208, LH = 18;
  const cell = (i) => ({ x: Math.floor(pos[i]) - 1, y: LY, width: Math.ceil(pos[i + 1] - pos[i]) + 2, height: LH });
  // separadores fixos: "·", ":" e "Z"
  const stat = { x: Math.floor(pos[0]) - 4, y: LY, width: Math.ceil(pos[18] - pos[0]) + 16, height: LH };
  await save(lineSvg(refInner([...REF], (i) => [11, 15, 18].includes(i))), 'cw_date_static', stat);
  const DIGPOS = { dd0: [4, 4], dd1: [5, 10], uh0: [13, 3], uh1: [14, 10], um0: [16, 6], um1: [17, 10] };
  for (const [k, [idx, n]] of Object.entries(DIGPOS)) for (let d = 0; d < n; d++) {
    const chars = [...REF]; chars[idx] = String(d);
    await save(lineSvg(refInner(chars, (i) => i === idx)), `cw_${k}_${d}`, cell(idx));
  }
  const wdBox = { x: Math.floor(pos[0]) - 14, y: LY, width: Math.ceil(pos[3] - pos[0]) + 16, height: LH };
  for (let i = 0; i < 7; i++) await save(lineSvg(WEEKDAYS[i], 'end', pos[3]), `cw_wd_${i + 1}`, wdBox);
  const moBox = { x: Math.floor(pos[7]) - 2, y: LY, width: Math.ceil(pos[10] - pos[7]) + 16, height: LH };
  for (let i = 0; i < 12; i++) await save(lineSvg(MONTHS[i], 'start', pos[7]), `cw_mo_${i + 1}`, moBox);
  await browser.close();

  // ---- watchface.xml
  const img = (res, b, extra = '') => `<PartImage x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}"${extra}><Image resource="${res}"/></PartImage>`;
  const cond = (name, expr, values, body) => `<Condition><Expressions>${values.map((v) => `<Expression name="${name}${v}"><![CDATA[${expr(v)}]]></Expression>`).join('')}</Expressions>${values.map((v) => `<Compare expression="${name}${v}">${body(v)}</Compare>`).join('')}</Condition>`;
  const range = (n) => [...Array(n).keys()];
  const tensExpr = (src) => (v) => `${src} >= ${v * 10} && ${src} < ${(v + 1) * 10}`;
  const unitExpr = (src) => (v) => `${src} % 10 == ${v}`;
  const H = '[HOUR_0_23]', M = '[MINUTE]';
  const UTC_H = '(floor(([UTC_TIMESTAMP] - [MINUTE] * 60000 - [SECOND] * 1000 + 1800000) / 3600000) % 24)';
  const full = { x: 0, y: 0, width: 450, height: 450 };
  const AMB_HIDE = '<Variant mode="AMBIENT" target="alpha" value="0"/>';
  const AMB_SHOW = '<Variant mode="AMBIENT" target="alpha" value="255"/>';
  const group = (name, body, attrs = '', pre = '') => `<Group name="${name}" x="0" y="0" width="450" height="450"${attrs}>${pre}${body}</Group>`;
  const pairTiles = (src, tPos, uPos, tens, set, ambSet) =>
    group(`tiles_${tPos}_${set}`, cond('t', tensExpr(src), range(tens), (v) => img(`cw_t${tPos}_${set}_${v}`, tileClip(tPos))) +
      cond('u', unitExpr(src), range(10), (v) => img(`cw_t${uPos}_${set}_${v}`, tileClip(uPos))), '', AMB_HIDE) +
    group(`aod_${tPos}_${set}`, cond('t', tensExpr(src), range(tens), (v) => img(`cw_g_${ambSet}_${v}`, tileClip(tPos))) +
      cond('u', unitExpr(src), range(10), (v) => img(`cw_g_${ambSet}_${v}`, tileClip(uPos))), ' alpha="0"', AMB_SHOW);
  const minutes = (set) => pairTiles(M, 2, 3, 6, set, set);
  const stateGroup = (s) => group(`state_${s.key}`,
    `<PartImage x="0" y="0" width="450" height="450">${AMB_HIDE}<Image resource="cw_bg_${s.key}"/></PartImage>` +
    `<PartImage x="0" y="0" width="450" height="450" alpha="0">${AMB_SHOW}<Image resource="cw_aod_${s.key}"/></PartImage>` +
    minutes(s.lav ? 'l' : 'c'));
  // ciclo automático "O dia no pulso": cada estado fica ~4,6 s por minuto
  const N = specs.states.length;
  const bins = range(N).map((k) => [Math.ceil((k * 60) / N), Math.ceil(((k + 1) * 60) / N)]);
  const auto = cond('phase', (k) => `[SECOND] >= ${bins[k][0]} && [SECOND] < ${bins[k][1]}`, range(N), (k) => stateGroup(specs.states[k]));
  const hours = pairTiles(H, 0, 1, 3, 'w', 'w');
  const dateLine = group('date',
    img('cw_date_static', stat) +
    cond('w', (v) => `[DAY_OF_WEEK] == ${v + 1}`, range(7), (v) => img(`cw_wd_${v + 1}`, wdBox)) +
    cond('d', (v) => `[DAY] >= ${v * 10} && [DAY] < ${(v + 1) * 10}`, range(4), (v) => img(`cw_dd0_${v}`, cell(4))) +
    cond('e', unitExpr('[DAY]'), range(10), (v) => img(`cw_dd1_${v}`, cell(5))) +
    cond('m', (v) => `[MONTH] == ${v + 1}`, range(12), (v) => img(`cw_mo_${v + 1}`, moBox)) +
    cond('h', tensExpr(UTC_H), range(3), (v) => img(`cw_uh0_${v}`, cell(13))) +
    cond('i', unitExpr(UTC_H), range(10), (v) => img(`cw_uh1_${v}`, cell(14))) +
    cond('n', tensExpr(M), range(6), (v) => img(`cw_um0_${v}`, cell(16))) +
    cond('o', unitExpr(M), range(10), (v) => img(`cw_um1_${v}`, cell(17))), '', AMB_HIDE);
  const C = 225, rad = (d) => ((d - 90) * Math.PI) / 180;
  const taps = SHORTCUTS.map((sc) => {
    const x = Math.round(C + 172 * Math.cos(rad(sc.a))) - 40, y = Math.round(C + 172 * Math.sin(rad(sc.a))) - 40;
    return `<Group name="tap_${sc.id}" x="${x}" y="${y}" width="80" height="80"><Launch target="${sc.target}"/><PartDraw x="0" y="0" width="80" height="80"><Ellipse x="0" y="0" width="80" height="80"><Fill color="#01000000"/></Ellipse></PartDraw></Group>`;
  }).join('\n    ');

  const options = [{ id: 'auto', name: 'Automático · O dia no pulso' }, ...specs.states.map((s) => ({ id: s.key, name: s.name }))];
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<!--
  CrewWatch QA · Painel de Voo — Watch Face Format v1, 450 × 450.
  GERADO por design/crewwatch/wff-qa/tools/generate.cjs a partir de design/crewwatch/crewwatch.html.
  Não edite à mão: rode o gerador. Todos os dados operacionais são fictícios (DEMO).
-->
<WatchFace width="450" height="450" clipShape="CIRCLE">
  <Metadata key="CLOCK_TYPE" value="DIGITAL"/>
  <Metadata key="PREVIEW_TIME" value="10:09:00"/>
  <UserConfigurations>
    <ListConfiguration id="phase" displayName="cfg_phase" screenReaderText="cfg_phase" defaultValue="auto">
      ${options.map((o) => `<ListOption id="${o.id}" displayName="opt_${o.id}" screenReaderText="opt_${o.id}"/>`).join('\n      ')}
    </ListConfiguration>
  </UserConfigurations>
  <Scene backgroundColor="#FF000000">
    <ListConfiguration id="phase">
      <ListOption id="auto">${auto}</ListOption>
      ${specs.states.map((s) => `<ListOption id="${s.key}">${stateGroup(s)}</ListOption>`).join('\n      ')}
    </ListConfiguration>
    ${hours}
    ${dateLine}
    ${taps}
  </Scene>
</WatchFace>
`;
  fs.writeFileSync(path.join(RAW, 'watchface.xml'), xml);

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, "\\'");
  const strings = `<?xml version="1.0" encoding="utf-8"?>
<!-- GERADO por tools/generate.cjs. -->
<resources>
    <string name="app_name">CrewWatch QA · Painel de Voo</string>
    <string name="cfg_phase">Fase (DEMO)</string>
${options.map((o) => `    <string name="opt_${o.id}">${esc(o.name)}</string>`).join('\n')}
</resources>
`;
  fs.mkdirSync(path.join(RES, 'values'), { recursive: true });
  fs.writeFileSync(path.join(RES, 'values', 'strings.xml'), strings);
  console.log(`estados: ${specs.states.length} · imagens: ${files.length} · watchface.xml: ${(xml.length / 1024).toFixed(1)} KB`);
})().catch((e) => { console.error(e); process.exit(1); });
