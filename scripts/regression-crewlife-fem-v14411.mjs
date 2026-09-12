import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const fail = (message) => { console.error(`FAIL: ${message}`); process.exitCode = 1; };
const pass = (message) => console.log(`PASS: ${message}`);
const requireText = (source, text, message) => source.includes(text) ? pass(message) : fail(message);
const forbid = (source, pattern, message) => pattern.test(source) ? fail(message) : pass(message);

const engine = read('client/src/lib/crewLifeFem.ts');
const panel = read('client/src/components/v14411/CrewLifeFemPanel.tsx');
const view = read('client/src/components/v1434/CrewCheckLifeView.tsx');
const prepare = read('scripts/v139/apply.mjs');

requireText(prepare, "await import('../v14411/apply.mjs');", 'v14411 faz parte da cadeia canônica');
requireText(view, "import CrewLifeFemPanel from '@/components/v14411/CrewLifeFemPanel';", 'CrewLife Fem integrado ao Life');
requireText(view, '<CrewLifeFemPanel', 'painel CrewLife Fem renderizado');
requireText(panel, "const KEY = 'crewcheck:life:fem:v1';", 'armazenamento local versionado');
requireText(panel, 'Desativado por padrão', 'opt-in explícito visível');
requireText(panel, 'não são enviados ao empregador', 'limite de compartilhamento explícito');
requireText(panel, 'Apagar dados do Fem', 'exclusão local disponível');
requireText(panel, 'O CrewCheck não converte “cansada” em diagnóstico de fadiga.', 'autorrelato não vira diagnóstico');
requireText(engine, 'maturityForSample', 'aprendizado expõe maturidade de amostra');
requireText(engine, 'sampleSize', 'insights expõem tamanho de amostra');
requireText(engine, 'associação pessoal, não causalidade', 'motor evita causalidade indevida');
requireText(engine, 'earlyStart', 'motor considera early start');
requireText(engine, 'sleepQuality', 'motor considera sono percebido');
requireText(engine, 'symptoms', 'motor considera sintomas autorreportados');

forbid(panel, /Você (?:está|ficará) fadigad[ao]/i, 'UI não declara fadiga atual/futura');
forbid(panel, /Você (?:está|ficará) (?:inapta|inapto)/i, 'UI não declara aptidão/inaptidão');
forbid(panel, /(?:diagnosticamos|diagnóstico de) (?:TPM|SOP|endometriose|gravidez)/i, 'UI não diagnostica condição ginecológica');
forbid(engine, /(?:pregnan|gravidez|ovula(?:ção|ting)|fertility|fertilidade)/i, 'motor não infere gravidez/ovulação/fertilidade');

if (process.exitCode) process.exit(process.exitCode);
console.log('CrewLife Fem v14411 regression: GREEN');
