import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const main = read('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java');
const life = read('client/src/components/v1434/CrewCheckLifeView.tsx');
const gradle = read('android-wrapper/app/build.gradle');
const pkg = JSON.parse(read('package.json'));

assert.match(main, /public String appVersion\(\)/, 'Versão nativa não foi exposta.');
assert.match(main, /window\.CrewCheckHealth=\{/, 'Fachada CrewCheckHealth não foi injetada.');
assert.match(main, /healthBridgePostMessage/, 'Fallback Health Connect não está na ponte nativa.');
assert.match(life, /const stable = \(window as any\)\.CrewCheckHealth/, 'Cliente não prioriza a fachada JS estável.');
assert.match(life, /native\.healthBridgePing\(\)/, 'Fallback nativo não é testado por chamada real.');
assert.doesNotMatch(life, /typeof native\.healthBridgePostMessage === 'function'/, 'Cliente ainda usa typeof em método Java do WebView.');
assert.match(gradle, /versionCode\s+140308/, 'versionCode Android incorreto.');
assert.match(gradle, /versionName\s+["']14\.3\.8["']/, 'versionName Android incorreto.');
assert.equal(pkg.version, '14.3.8', 'Versão pública incorreta.');

console.log('CrewCheck v14.3.8: fachada Health Connect para WebView validada.');
