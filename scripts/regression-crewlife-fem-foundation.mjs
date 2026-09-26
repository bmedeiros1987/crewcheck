import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const fem = read('client/src/components/v1434/CrewLifeFemPanel.tsx');
const life = read('client/src/components/v1434/CrewCheckLifeView.tsx');
const css = read('client/src/components/v1434/crewcheck-life.css');

assert.match(life, /import CrewLifeFemPanel from '\.\/CrewLifeFemPanel'/);
assert.match(life, /<CrewLifeFemPanel\/>/);

assert.match(fem, /crewcheck:life:fem:v1/);
assert.match(fem, /OPCIONAL · CONSENTIMENTO SEPARADO/);
assert.match(fem, /consentChecked/);
assert.match(fem, /Começou hoje/);
assert.match(fem, /cycleDay\(/);
assert.match(fem, /Sem estimativa de fase ou fertilidade/);
assert.match(fem, /Não infere ovulação, fertilidade, gravidez, diagnóstico ou aptidão operacional/);
assert.match(fem, /localStorage\.setItem/);
assert.match(fem, /localStorage\.removeItem/);
assert.match(fem, /crewcheck:life-fem-updated/);

// Fail closed: Fem v1 is local-only and does not ride on the general watch/health consent.
assert.doesNotMatch(fem, /fetch\s*\(/);
assert.doesNotMatch(fem, /XMLHttpRequest/);
assert.doesNotMatch(fem, /AndroidCrewCheckNative/);
assert.doesNotMatch(fem, /publishWatch/);
assert.doesNotMatch(fem, /AndroidCrewCheckHealth/);

assert.match(css, /\.cc-life-fem \{/);
assert.match(css, /#ec4899/);

console.log('[crewlife-fem] separate consent + local-only foundation OK');
