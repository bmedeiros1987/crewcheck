import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const component = fs.readFileSync('client/src/components/voyage/VoyageIntegrated.tsx', 'utf8');
const css = fs.readFileSync('client/src/components/voyage/voyage-integrated.css', 'utf8');
const backend = fs.readFileSync('server/v1412/voyageIntegration.mjs', 'utf8');
const router = fs.readFileSync('server/v139/index.mjs', 'utf8');
const apply = fs.readFileSync('scripts/v14411/apply.mjs', 'utf8');
const masterApply = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');
const docs = fs.readFileSync('docs/voyage-integrated.md', 'utf8');

assert.ok(home.includes("@/components/voyage/VoyageIntegrated"), 'Home deve importar VoyageIntegrated após prepare');
assert.ok(home.includes("| 'voyage' | 'radar'"), 'ZeroView deve reconhecer Voyage');
assert.ok(home.includes("['voyage','Voyage','Explorer do tripulante · entorno e tempo livre',Globe2]"), 'menu deve expor Voyage em escopo Explorer');
assert.ok(home.includes("view === 'voyage' && <VoyageIntegrated"), 'Home deve renderizar a superfície Voyage');
assert.ok(!home.includes("['explorer','CrewCheck Explorer'"), 'marca CrewCheck Explorer não deve coexistir como superfície separada');

assert.ok(component.includes('CREWCHECK × VOYAGE'), 'layout deve comunicar integração CrewCheck × Voyage');
assert.ok(component.includes('Beyond the trip.'), 'layout deve preservar tagline Voyage');
assert.ok(component.includes('preserva o conceito do antigo CrewCheck Explorer'), 'UI deve deixar explícita a continuidade conceitual do Explorer');
assert.ok(component.includes('não substitui nem replica as funções operacionais do CrewCheck'), 'UI deve proibir competição funcional com CrewCheck');
assert.ok(component.includes('Descoberta, não operação'), 'modo embutido deve ser discovery-first');
assert.ok(component.includes('Operação continua aqui'), 'UI deve manter domínio operacional no CrewCheck');
assert.ok(component.includes('Abrir Voyage completo'), 'app Voyage completo deve ficar claramente separado do modo embutido');
assert.ok(component.includes('userApprovedShare: true'), 'compartilhamento da escala deve partir de ação explícita do usuário');
assert.ok(component.includes('window.location.assign(target)'), 'entrada no Voyage completo deve continuar disponível');
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
assert.ok(apply.includes('preservando o conceito Explorer'), 'patch deve declarar preservação do Explorer sob a marca Voyage');
assert.ok(!apply.includes('CrewCheck Explorer substituído pelo Voyage'), 'patch não pode declarar substituição do conceito Explorer');
assert.ok(docs.includes('CrewCheck Explorer é preservado'), 'documentação deve registrar a fronteira corrigida');
assert.ok(docs.includes('não deve replicar nem competir com funcionalidades nativas do CrewCheck'), 'documentação deve impedir duplicação funcional');
assert.ok(masterApply.includes("await import('../v14411/apply.mjs');"), 'prepare canônico deve aplicar v14.4.11');

console.log('CrewCheck v14.4.11 Voyage Explorer boundary regression: PASS');
