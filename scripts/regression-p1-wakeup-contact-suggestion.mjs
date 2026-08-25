import fs from 'node:fs';
import assert from 'node:assert/strict';
import { loadClientModules } from './lib/ts-module-harness.mjs';

const { load, cleanup } = loadClientModules({
  files: ['client/src/lib/wakeupContact.ts'],
  prefix: 'crewcheck-wakeup-contact-',
});
const contact = load('wakeupContact');

let passed = 0;
function check(name, condition, detail = '') {
  assert.ok(condition, `${name}${detail ? ` — ${detail}` : ''}`);
  passed += 1;
  console.log(`PASS ${name}`);
}

try {
  check('normaliza caller ID somente para E.164 simples', contact.normalizeWakeupCallerId('+55 (16) 72874-2360') === '+5516728742360');
  check('aceita numero somente em digitos', contact.normalizeWakeupCallerId('5516728742360') === '+5516728742360');
  check('rejeita caller ID curto/invalido', contact.normalizeWakeupCallerId('12345') === '');
  check('extrai caller ID do health sem acoplar ao provedor na UI', contact.wakeupCallerIdFromHealth({ phoneProvider: { infobip: { callerId: '5516728742360' } } }) === '+5516728742360');
  check('health sem caller ID nao inventa numero', contact.wakeupCallerIdFromHealth({ phoneProvider: { infobip: {} } }) === '');

  const vcard = contact.buildWakeupContactVCard('5516728742360');
  check('vCard usa o nome Despertador CrewCheck', vcard.includes('FN:Despertador CrewCheck'));
  check('vCard inclui o caller ID normalizado', vcard.includes('TEL;TYPE=CELL:+5516728742360'));
  check('vCard identifica a finalidade sem segredo', vcard.includes('Ligação oficial do Despertador CrewCheck.'));
  check('caller ID invalido nao gera vCard', contact.buildWakeupContactVCard('abc') === '');

  const apply = fs.readFileSync('scripts/v14406/apply.mjs', 'utf8');
  check('materializador expoe caller ID a partir da configuracao, sem hardcode', apply.includes('configuration.from ?') && !apply.includes('5516728742360'));
  check('materializador insere CTA de contatos no WakeupView', apply.includes('Adicionar Despertador CrewCheck aos contatos'));
  check('CTA declara que nao pede acesso a contatos', apply.includes('nao pede acesso aos seus contatos'));

  console.log(`\n${passed}/12 checks passed`);
} finally {
  cleanup();
}
