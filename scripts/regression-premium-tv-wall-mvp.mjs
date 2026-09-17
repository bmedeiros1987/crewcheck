import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ${message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✅ ${message}`);
}

const app = fs.readFileSync('client/src/App.tsx', 'utf8');
const page = fs.readFileSync('client/src/pages/PremiumTvPage.tsx', 'utf8');
const news = fs.readFileSync('client/src/lib/aviationNewsClient.ts', 'utf8');

assert(app.includes('import PremiumTvPage'), 'App registra a superfície Premium TV');
assert(app.includes('path="/tv"') && app.includes('<PremiumTvPage />'), 'rota /tv protegida existe');
assert(app.includes('path="/televisao"') && app.includes('path="/wall"'), 'aliases de TV existem');

assert(page.includes('listSavedRosters') && page.includes('openSavedRoster'), 'TV consome a escala salva existente');
assert(page.includes('getBillingStatus') && page.includes('premiumAccess'), 'TV usa entitlement Premium existente');
assert(page.includes("'/api/weather/airport") || page.includes('`/api/weather/airport'), 'TV reutiliza meteo existente');
assert(page.includes("'/api/radar-flight") || page.includes('`/api/radar-flight'), 'TV reutiliza Radar existente');
assert(page.includes("type TvMode = 'briefing' | 'operational' | 'ambient'"), 'modos Briefing/Operacional/Ambient estão definidos');
assert(page.includes("type PrivacyMode = 'family' | 'private'"), 'privacidade familiar/privada está explícita');
assert(page.includes("privacy === 'private' && currentOrNext?.hotel"), 'hotel só aparece na visão privada');
assert(!/room|quarto/i.test(page.replace(/quarto(s)?\s+aparece/gi, '')), 'TV não expõe número de quarto');
assert(page.includes('Remota'), 'UI prevê identificação de posição remota quando confirmada');
assert(page.includes('AVIATION_NEWS_SOURCE_NOTE'), 'notícia é rotulada como informativa, não operacional');

assert(news.includes('www.airbus.com/en/generate-rss-feeds'), 'feed oficial Airbus configurado');
assert(news.includes('investors.boeing.com/rss/pressrelease.aspx'), 'feed oficial Boeing configurado');
assert(news.includes('site:gov.br/anac') && news.includes('site:decea.mil.br') && news.includes('site:embraer.com'), 'feed Brasil restringe busca a fontes-alvo');
assert(news.includes('CACHE_TTL_MS = 15 * 60_000'), 'feed possui cache para reduzir chamadas');
assert(news.includes('Promise.allSettled'), 'falha de uma fonte não derruba todas as notícias');
assert(news.includes('dedupe('), 'feed deduplica manchetes');

const forbiddenPageTokens = ['parsePdfOnServer', 'parseAimsTokensIntoEventsV3', 'analyzeCompliance(', 'financialRules'];
for (const token of forbiddenPageTokens) {
  assert(!page.includes(token), `TV não duplica motor protegido: ${token}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log('✅ CrewCheck Premium TV Wall MVP: regressão estrutural verde');
