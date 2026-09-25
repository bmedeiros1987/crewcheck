import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const legal = read('client/src/pages/LegalPage.tsx');
const html = read('client/public/privacy.html');
const listing = read('docs/play-store/crewcheck-roster/pt-BR/crewlife-description.txt');
const checklist = read('docs/play-store/crewcheck-roster/health-review-2026-09-25.md');
const releasePolicy = JSON.parse(read('scripts/android-play/release-policy.json'));
const storePolicy = read('android-wrapper/store-policy.gradle');
const manifest = read('android-wrapper/app/src/main/AndroidManifest.xml');
const samsung = read('android-wrapper/lifecompanion/src/main/java/com/crewcheck/life/SamsungHealthRuntime.java');

function legalParagraphs(source) {
  const section = source.match(/title: '3-A\. CrewLife — atividade, sono e bem-estar',\s*paragraphs:\s*\[([\s\S]*?)\n\s*\],/);
  assert.ok(section, 'CrewLife disclosure must be rendered by LegalPage');
  // Parse string literals only: never evaluate the TSX or execute user-supplied text.
  return [...section[1].matchAll(/^\s*'((?:\\.|[^'\\])*)',?\s*$/gm)]
    .map((match) => match[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
}

function htmlParagraphs(source) {
  const section = source.match(/<section id="crewlife-privacy">([\s\S]*?)<\/section>/);
  assert.ok(section, 'Public HTML must expose CrewLife without JavaScript/login');
  return [...section[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map((match) => match[1]
    .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
}

function assertParity(reactSource, htmlSource) {
  const paragraphs = legalParagraphs(reactSource);
  assert.equal(paragraphs.length, 8, 'All eight CrewLife privacy paragraphs are required');
  assert.deepEqual(htmlParagraphs(htmlSource), paragraphs, 'Public and in-app CrewLife disclosures must match');
}

function assertDisclosure(source, name) {
  for (const text of [
    'com.crewcheck.app', 'com.crewcheck.life', 'Samsung Health Data SDK',
    'não solicita permissões do Health Connect e não acessa o Health Connect',
    'não são dispositivos médicos',
    'não diagnosticam, tratam, curam ou previnem qualquer condição médica',
    'consulte um profissional de saúde qualificado',
    'consentimento separado', 'decisões operacionais',
  ]) assert.ok(source.includes(text), `${name}: missing disclosure: ${text}`);
  for (const obsolete of [
    /conceder cada permissão no Health Connect/i,
    /Android\s*(?:>|&gt;)\s*Health Connect/i,
    /Health Connect\s*(?:>|&gt;)\s*Permissões/i,
    /frequência cardíaca em repouso/i,
  ]) assert.doesNotMatch(source, obsolete, `${name}: obsolete Health Connect claim`);
}

function assertStoreTarget(policy) {
  assert.equal(policy.artifacts.app.package, 'com.crewcheck.app');
  assert.ok(Number.isInteger(policy.artifacts.app.targetSdk) && policy.artifacts.app.targetSdk >= 36,
    'Mobile Play targetSdk must be API 36 or newer');
}

function assertNoHealthPermissions(source) {
  assert.doesNotMatch(source, /android:name\s*=\s*["']android\.permission\.health\.[^"']+["']/,
    'Main Play manifest must not request Health Connect data');
}

test('CrewLife privacy paragraphs are identical on both public surfaces', () => {
  assertParity(legal, html);
});

test('privacy dates agree without changing the Terms date', () => {
  const date = legal.match(/const PRIVACY_LAST_UPDATED = '([^']+)'/);
  assert.ok(date);
  assert.ok(html.includes(`<strong>Última atualização:</strong> ${date[1]}`));
  assert.ok(legal.includes("const TERMS_LAST_UPDATED = '19 de julho de 2026'"));
});

test('privacy and store copy disclose the actual optional, non-medical architecture', () => {
  for (const [name, source] of Object.entries({ legal, html, listing })) assertDisclosure(source, name);
  assert.ok(legal.includes('não medições de sensores'));
  assert.ok(listing.includes('não são medições de sensores'));
  assert.ok(html.includes('não apaga o histórico do Samsung Health nem substitui a revogação do Companion'));
  assert.ok(html.includes('também são transferidos para o relógio do usuário'));
});

test('Samsung fields in the disclosure exist in the source adapter', () => {
  for (const field of ['steps', 'activeMinutes', 'distanceMeters', 'caloriesBurned',
    'sleepMinutes', 'sleepStart', 'sleepEnd', 'sleepScore', 'energyScore']) {
    assert.ok(samsung.includes(`json.put("${field}"`), `Undocumented source change: ${field}`);
  }
});

test('the source release policy preserves target API and Health Connect exclusion', () => {
  assertStoreTarget(releasePolicy);
  assertNoHealthPermissions(manifest);
  assert.ok(storePolicy.includes('targetSdk artifact.targetSdk as Integer'));
  assert.ok(storePolicy.includes("exclude '**/CrewCheckHealthBridge.kt'"));
  assert.ok(storePolicy.includes("exclude group: 'androidx.health.connect', module: 'connect-client'"));
  // Final compiled AAB verification remains the responsibility of the existing
  // signed-store/bundletool gate. This test does not claim to inspect an AAB.
});

test('submission checklist removes unused permissions without claiming Console publication', () => {
  for (const permission of ['READ_DISTANCE', 'READ_EXERCISE', 'READ_STEPS', 'READ_SLEEP', 'READ_RESTING_HEART_RATE']) {
    assert.ok(checklist.includes(`| \`${permission}\` | REMOVER |`), `${permission} needs an explicit disposition`);
  }
  assert.ok(checklist.includes('Não comprova que os textos foram publicados'));
  assert.ok(checklist.includes('A declaração é do aplicativo inteiro'));
  assert.ok(checklist.includes('versões retidas'));
  assert.ok(checklist.includes('nenhum novo erro ou inconsistência'));
  assert.ok(listing.length > 500 && listing.length < 4000, 'Description block must fit; verify combined listing separately');
});

test('negative: divergent static policy fails the parity gate', () => {
  assert.throws(() => assertParity(legal, html.replace('não acessa o Health Connect', 'acessa o Health Connect')));
});

test('negative: missing disclaimer and stale access instructions are rejected', () => {
  assert.throws(() => assertDisclosure(listing.replace('não são dispositivos médicos', 'são dispositivos médicos'), 'mutation'));
  assert.throws(() => assertDisclosure(`${listing}\nAndroid > Health Connect > Permissões`, 'mutation'));
});

test('negative: lower target API and reintroduced health permission are rejected', () => {
  const lowerTarget = structuredClone(releasePolicy);
  lowerTarget.artifacts.app.targetSdk = 35;
  assert.throws(() => assertStoreTarget(lowerTarget));
  assert.throws(() => assertNoHealthPermissions('<uses-permission android:name="android.permission.health.READ_STEPS" />'));
});
