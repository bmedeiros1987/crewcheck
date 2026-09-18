import fs from 'node:fs';

const cssPath = 'client/src/components/v1406/premium-layout.css';
const marker = 'CrewCheck P0 — Saída portrait-first e horário atômico';
const css = `
/* ${marker} */
.cz-depart-when {
  width: 100% !important;
  grid-template-columns: minmax(0, 1fr) !important;
  align-items: start !important;
}
.cz-depart-time {
  display: block !important;
  width: max-content !important;
  max-width: 100% !important;
  white-space: nowrap !important;
  overflow-wrap: normal !important;
  word-break: keep-all !important;
  hyphens: none !important;
  font-variant-numeric: tabular-nums !important;
  font-size: clamp(2.35rem, 13vw, 4.7rem) !important;
  letter-spacing: -.04em !important;
  line-height: .98 !important;
}
@media (max-width: 720px) {
  .cz-departure {
    width: 100% !important;
    max-width: 100% !important;
  }
  .cz-depart-hero {
    grid-template-columns: minmax(0, 1fr) !important;
    grid-template-areas:
      "eyebrow"
      "status"
      "when"
      "route"
      "detail"
      "warning" !important;
  }
  .cz-depart-when > span,
  .cz-depart-time,
  .cz-depart-hero h2,
  .cz-depart-detail {
    justify-self: stretch !important;
    min-width: 0 !important;
  }
}
`;

const source = fs.readFileSync(cssPath, 'utf8');
if (!source.includes(marker)) fs.writeFileSync(cssPath, `${source.trimEnd()}\n${css}\n`, 'utf8');

console.log('[p0-departure-portrait] Saída portrait-first aplicada; horário não quebra entre dígitos.');
