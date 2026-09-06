import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const component = fs.readFileSync('client/src/components/voyage/VoyageIntegrated.tsx', 'utf8');
const css = fs.readFileSync('client/src/components/voyage/voyage-integrated.css', 'utf8');
const backend = fs.readFileSync('server/v1412/voyageIntegration.mjs', 'utf8');
const router = fs.readFileSync('server/v139/index.mjs', 'utf8');
const apply = fs.readFileSync('scripts/v14411/apply.mjs', 'utf8');
const masterApply = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');

assert.ok(home.includes("@/components/voyage/VoyageIntegrated"), 'Home deve importar VoyageIntegrated após prepare');
assert.ok(home.includes("| 'voyage' | 'radar'"), 'ZeroView deve reconhecer Voyage');
assert.ok(home.includes("['voyage','Voyage','Beyond the trip · integrado ao CrewCheck',Globe2]"), 'menu deve expor Voyage integrado');
assert.ok(home.includes("view === 'voyage' && <VoyageIntegrated"), 'Home deve renderizar a superfície Voyage');
assert.ok(!home.includes("['explorer','CrewCheck Explorer'"), 'CrewCheck Explorer não deve coexistir como superfície concorrente');

assert.ok(component.includes('CREWCHECK × VOYAGE'), 'layout deve comunicar integração CrewCheck × Voyage');
assert.ok(component.includes('Beyond the trip.'), 'layout deve preservar tagline Voyage');
assert.ok(component.includes('userApprovedShare: true'), 'compartilhamento da escala deve partir de ação explícita do usuário');
assert.ok(component.includes('window.location.assign(target)'), 'entrada no Voyage deve ocorrer no mesmo contexto de navegação por padrão');
assert.ok(component.includes('Nomes de tripulantes, senhas, chaves de API, CPF, PNR'), 'UI deve explicar minimização de dados');
assert.ok(css.includes('.voyage-integrated-shell'), 'layout premium dedicado deve existir');
assert.ok(css.includes('@media (max-width: 680px)'), 'layout deve ser responsivo no mobile');

assert.ok(backend.includes("'/api/voyage/integration/status'"), 'backend deve expor status da integração');
assert.ok(backend.includes("'/api/voyage/integration/preview'"), 'backend deve expor preview integrado');
assert.ok(backend.includes("'x-crewcheck-service-token': config.serviceToken"), 'CrewCheck deve autenticar no Voyage server-to-server');
assert.ok(backend.includes('rawRosterShared: false'), 'contrato deve declarar que roster bruto não é compartilhado');
assert.ok(backend.includes('emailShared: false'), 'e-mail não deve cruzar produtos no bridge minimizado');
assert.ok(backend.includes('crewNamesShared: false'), 'nomes da tripulação não devem cruzar produtos');
assert.ok(backend.includes('providerSecretsShared: false'), 'segredos de provider não devem cruzar produtos');
assert.ok(backend.includes('sanitizeRoster'), 'backend deve minimizar a escala antes do envio');

assert.ok(router.includes('handleVoyageIntegrationRoute'), 'roteador principal deve registrar integração Voyage');
assert.ok(router.includes("'voyage-integrated'"), 'módulo deve aparecer no inventário do servidor');
assert.ok(apply.includes('CrewCheck Explorer substituído pelo Voyage'), 'patch deve declarar substituição do conceito Explorer');
assert.ok(masterApply.includes("await import('../v14411/apply.mjs');"), 'prepare canônico deve aplicar v14.4.11');

console.log('CrewCheck v14.4.11 Voyage integrated regression: PASS');
