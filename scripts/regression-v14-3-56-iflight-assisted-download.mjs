import assert from 'node:assert/strict';

process.env.CREWCHECK_V14356_SKIP_APPLY = '1';
const { patchIFlightSemiAutomaticV14356 } = await import('./v14356/apply.mjs');

const before = `function IFlightPushView({ actions }: { actions: QuickActions }) {
  function openPortal() {
    window.open('https://iflightla.ibsplc.aero/iflight-cwp/web/getMainPage');
  }
  return <button onClick={openPortal}>Abrir</button>;
}

function dutyHoursForRosterDay(day: RosterDay): number {
  return 0;
}`;

const after = patchIFlightSemiAutomaticV14356(before);

assert.match(after, /DOWNLOAD SEMIAUTOMÁTICO/);
assert.match(after, /1\. Abrir iFlight/);
assert.match(after, /2\. Gerar PDF em LT/);
assert.match(after, /3\. Selecionar PDF baixado/);
assert.match(after, /crewcheck:iflight-assisted-step/);
assert.match(after, /não pode vigiar sua pasta Downloads/);
assert.match(after, /usuário, senha, MFA, cookie e sessão não são enviados/);
assert.match(after, /iflight-cwp\/web\/getMainPage/);
assert.equal(patchIFlightSemiAutomaticV14356(after), after, 'o patch deve ser idempotente');

console.log('[v14.3.56-iflight-assisted-download] fluxo semiautomático validado.');
