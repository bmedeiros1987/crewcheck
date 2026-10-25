import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(process.env.NOTIFICATIONS_JSDOM_PACKAGE || import.meta.url);
const { JSDOM } = require('jsdom');
const built = await build({ entryPoints: ['scripts/fixtures/escala-contact-app.tsx'], outdir: '/tmp/escala-contact-dom-bundle', bundle: true, write: false, format: 'iife', jsx: 'automatic' });
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://fixture.example.invalid/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window: w } = dom;
w.structuredClone = structuredClone;
const errors = []; w.addEventListener('error', event => errors.push(event.message));
w.eval(built.outputFiles.find(file => file.path.endsWith('.js')).text);
const pause = () => new Promise(resolve => setTimeout(resolve, 5));
async function until(check, label) { const deadline = Date.now() + 3000; while (!check()) { if (Date.now() > deadline) throw Error('Timed out: ' + label + ' ' + w.document.body.textContent); await pause(); } }
const all = query => [...w.document.querySelectorAll(query)];
const button = text => all('button').find(el => el.textContent === text);
const phone = () => w.document.querySelector('a[aria-label="Escala"]');
const input = () => w.document.querySelector('input[type="tel"]');
const ready = value => until(() => phone()?.getAttribute('href') === 'tel:' + value, value);
const waitInput = value => until(() => input()?.value === value, 'input ' + value);
async function fill(value) { const field = input(); Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(field, value); field.dispatchEvent(new w.Event('input', { bubbles: true })); await pause(); }
const save = () => button('Salvar contato');
try {
  await ready('01141746343'); await waitInput('01141746343');
  assert.equal(phone().textContent, ''); assert.equal(phone().getAttribute('title'), 'Escala');
  assert.doesNotMatch(w.document.body.textContent, /01141746343/);
  phone().click(); assert.equal(w.fixture.forwarded.join(), 'tel:01141746343'); assert.equal(w.fixture.puts, 0);
  for (const value of ['tel:01141746343', '01141746343#', '*12345678', '01141746343;ext=9', '011 41746343', '+012345678', '1234567']) { await fill(value); assert.equal(save().disabled, true, value); }
  button('Cancelar edição').click(); await waitInput('01141746343'); assert.equal(w.fixture.puts, 0);
  await fill('+551141746344'); assert.equal(save().disabled, false);
  w.fixture.hold = 'PUT'; save().click(); save().click(); await until(() => w.fixture.held.length === 1, 'held update');
  assert.equal(w.fixture.puts, 1); w.release(); await ready('+551141746344'); await waitInput('+551141746344');
  w.fixture.mode = 'bad-record'; w.focusFixture(); await until(() => !phone(), 'malformed record denied'); await until(() => w.document.body.textContent.includes('Contato da Escala indisponível.'), 'unavailable notice');
  w.fixture.mode = 'read-error'; w.focusFixture(); await pause(); assert.equal(phone(), null);
  w.fixture.mode = 'ok'; w.focusFixture(); await ready('+551141746344');
  await fill('01141746349'); w.fixture.mode = 'bad-ack'; save().click();
  await until(() => w.document.body.textContent.includes('Alteração não confirmada.'), 'nonmonotonic acknowledgement denied'); assert.equal(save().disabled, true); assert.equal(w.fixture.contact.dialString, '+551141746344');
  w.fixture.mode = 'ok'; button('Recarregar contato').click(); await waitInput('+551141746344');
  await fill('01141746345'); w.fixture.mode = 'unknown-commit'; save().click();
  await until(() => w.document.body.textContent.includes('Alteração não confirmada.'), 'unknown commit'); assert.equal(save().disabled, true); assert.equal(w.fixture.puts, 3);
  w.fixture.mode = 'ok'; button('Recarregar contato').click(); await waitInput('01141746345'); w.focusFixture(); await ready('01141746345'); assert.equal(w.fixture.puts, 3);
  w.fixture.hold = 'GET'; w.focusFixture(); await until(() => w.fixture.held.length > 0, 'held old read');
  w.fixture.hold = ''; w.fixture.contact = { ...w.fixture.contact, dialString: '01141746346', revision: 3 }; w.focusFixture(); await ready('01141746346'); w.release(); await pause(); assert.equal(phone().getAttribute('href'), 'tel:01141746346');
  w.fixture.hold = 'ADMIN'; button('Recarregar contato').click(); await until(() => w.fixture.held.length > 0, 'held admin read');
  w.fixture.hold = ''; w.fixture.admin = false; w.session('synthetic-B'); await until(() => w.document.body.textContent.includes('Contato administrativo indisponível'), 'new account denied'); w.release(); await pause(); assert.equal(input(), null); await ready('01141746346');
  const handoffs = w.fixture.forwarded.length; w.localStorage.setItem('crewcheck_auth_token', 'replaced-without-event'); phone().click(); assert.equal(w.fixture.forwarded.length, handoffs, 'stale rendered link suppressed even before auth event');
  w.fixture.admin = true; w.session('synthetic-B', 'replacement-event'); await ready('01141746346'); await waitInput('01141746346');
  await fill('01141746347'); w.fixture.hold = 'PUT'; save().click(); await until(() => w.fixture.held.length === 1, 'old session write');
  w.session('synthetic-C'); await waitInput('01141746347');
  await until(() => input() && !input().disabled, 'new confirmed session editor ready');
  assert.equal(input().disabled, false, 'new confirmed session must not inherit old unresolved busy lock');
  await fill('01141746348'); save().click(); await until(() => w.fixture.held.length === 2, 'new session write');
  w.fixture.held.shift()(); await pause(); assert.equal(input().disabled, true, 'old finally cannot unlock a newer write');
  w.release(); await waitInput('01141746348'); await ready('01141746348');
  assert.equal(w.fixture.puts, 5); assert.deepEqual(errors, []);
  console.log('PASS actual React/auth-client DOM: icon-only default and changed URI; no automatic call; invalid phones; save/cancel/double-click; nonmonotonic ACK; unknown commit reread; stale reads; account/token/pending-write fences. Five synthetic PUTs, one intercepted user handoff, zero real network/calls.');
} finally { w.close(); }
