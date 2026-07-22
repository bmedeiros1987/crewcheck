import fs from 'node:fs';

const platform = fs.readFileSync('server/platform.mjs', 'utf8');
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const checks = [
  [platform.includes("code: 'VISITOR_LIMIT_REACHED'"), 'limite de convidados no servidor'],
  [platform.includes('guestLimit: premium ? 5 : 1'), 'limite 1/5 por plano'],
  [platform.includes('meteoFavorites: premium ? 20 : 2'), 'favoritos meteorológicos 2/20'],
  [platform.includes('meteoFollowHours: premium ? 24 : 3'), 'acompanhamento meteorológico 3/24 horas'],
  [platform.includes('ownerLimits.guestLimit'), 'acesso do convidado protegido após mudança de plano'],
  [platform.includes('1 convidado ativo e 2 favoritos meteorológicos'), 'catálogo gratuito transparente'],
  [platform.includes('até 5 visitantes'), 'catálogo Premium transparente'],
  [home.includes("const DEFAULT_VERSION = '14.3.1';"), 'versão do cliente'],
  [pkg.version === '14.3.1', 'versão do pacote'],
];

const failed = checks.filter(([ok]) => !ok).map(([, label]) => label);
if (failed.length) throw new Error(`[v14.3.1] Regressão falhou: ${failed.join(', ')}`);
console.log('[v14.3.1] Limites por plano e confiabilidade do gratuito verificados.');
