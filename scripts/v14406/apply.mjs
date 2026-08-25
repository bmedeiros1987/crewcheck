import fs from 'node:fs';

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v14406] Ancora nao encontrada: ${label}`);
  return source.replace(before, after);
}

function patchFile(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

patchFile('server/v1396/infobip.mjs', (source) => replaceOnce(
  source,
  `    detected: configuration.detected,\n    missing: configuration.missing,`,
  `    detected: configuration.detected,\n    // O caller ID nao e credencial: e o numero que aparece no aparelho do usuario.\n    // Expo-lo permite que o app gere um contato local sem hardcode de provedor.\n    callerId: configuration.from ? \`+\${configuration.from}\` : '',\n    missing: configuration.missing,`,
  'caller ID publico da Infobip',
));

patchFile('client/src/pages/Home.tsx', (source) => {
  let next = source;
  if (!next.includes("@/lib/wakeupContact")) {
    next = replaceOnce(
      next,
      `import { consumePendingRosterFocus, setPendingRosterFocus } from '@/lib/rosterFocus';`,
      `import { consumePendingRosterFocus, setPendingRosterFocus } from '@/lib/rosterFocus';\nimport { copyWakeupCallerId, downloadWakeupContact, wakeupCallerIdFromHealth } from '@/lib/wakeupContact';`,
      'import do contato do despertador',
    );
  }

  const start = next.indexOf('function WakeupView({ event }: { event: ZeroLeg }) {');
  const end = next.indexOf('function PresentationManagerView', start);
  if (start < 0 || end < 0) throw new Error('[v14406] WakeupView nao localizado.');
  let block = next.slice(start, end);

  if (!block.includes('const wakeupCallerId = wakeupCallerIdFromHealth(health);')) {
    block = replaceOnce(
      block,
      `  const admin = isAdmin();`,
      `  const admin = isAdmin();\n  const wakeupCallerId = wakeupCallerIdFromHealth(health);`,
      'caller ID no WakeupView',
    );
  }

  if (!block.includes('function addWakeupCallerToContacts()')) {
    const anchor = `  async function testAlarm(testType: 'telegram-message' | 'telegram-call' | 'phone-call') {`;
    const helper = `  function addWakeupCallerToContacts() {\n    if (!wakeupCallerId) {\n      toast.info('O numero do Despertador CrewCheck ainda nao esta disponivel.');\n      return;\n    }\n    const started = downloadWakeupContact(wakeupCallerId);\n    if (!started) {\n      toast.error('Nao consegui preparar o contato neste dispositivo.');\n      return;\n    }\n    storage.set('crewcheck_wakeup_contact_prompted_v1', '1');\n    toast.success('Contato preparado. Abra o arquivo para adicionar Despertador CrewCheck a agenda.');\n  }\n\n  async function copyWakeupCallerNumber() {\n    const copied = await copyWakeupCallerId(wakeupCallerId);\n    if (copied) toast.success('Numero do despertador copiado.');\n    else toast.error('Nao consegui copiar o numero.');\n  }\n\n`;
    block = replaceOnce(block, anchor, helper + anchor, 'acoes de contato');
  }

  if (!block.includes('Adicionar Despertador CrewCheck aos contatos')) {
    const anchor = `<section className="cz-toolbox"><h2>Despertadores no servidor</h2>`;
    const card = `{wakeupCallerId && <section className="cz-toolbox"><div className="cz-roster-main"><span className="cz-roster-icon"><Phone/></span><div className="cz-roster-copy"><h2>Identifique a ligacao do despertador</h2><p>Salve <strong>Despertador CrewCheck</strong> na agenda para reconhecer a chamada quando o app estiver fechado.</p><small>{wakeupCallerId} · o CrewCheck nao pede acesso aos seus contatos.</small></div></div><div className="cz-tool-actions"><button className="primary" onClick={addWakeupCallerToContacts}><Plus/> Adicionar Despertador CrewCheck aos contatos</button><button onClick={copyWakeupCallerNumber}><Copy/> Copiar numero</button></div></section>}`;
    block = replaceOnce(block, anchor, card + anchor, 'card de sugestao de contato');
  }

  next = next.slice(0, start) + block + next.slice(end);
  return next;
});

console.log('[v14406] Sugestao segura para salvar o Despertador CrewCheck nos contatos aplicada.');
