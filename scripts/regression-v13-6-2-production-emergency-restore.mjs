import fs from 'node:fs';
import { execSync } from 'node:child_process';
const home = fs.readFileSync('client/src/pages/Home.tsx','utf8');
const server = fs.readFileSync('server.mjs','utf8');
const css = fs.readFileSync('client/src/index.css','utf8');
function assert(c,m){ if(!c){ console.error(`ERRO: ${m}`); process.exit(1); } console.log(`OK: ${m}`); }
assert(home.includes("const DEFAULT_VERSION = '13.6.2'"),'versão 13.6.2 aplicada');
assert(server.includes('/api/aviation-weather'),'endpoint aviation weather existe');
assert(server.includes('handleAviationWeather'),'handler aviation weather existe');
assert(server.includes('/api/maps/route-preview'),'endpoint route registrado');
assert(server.includes('/api/places/fitness'),'endpoint places registrado');
assert(server.includes('/api/osm/route-preview'),'endpoint OSM route existe');
assert(server.includes('/api/osm/health'),'endpoint OSM health existe');
assert(server.includes('/api/telegram/health'),'endpoint Telegram health existe');
assert(server.includes('/api/alarm/health'),'endpoint alarm health existe');
assert(server.includes("url.pathname.startsWith('/api/')"),'fallback API JSON existe');
assert(server.indexOf("url.pathname.startsWith('/api/')") < server.indexOf('return serveStatic(req, res, url)'),'API fallback antes do serveStatic');
assert(css.includes('Production Emergency Layout Guard'),'CSS emergency guard existe');
assert(css.includes('writing-mode:horizontal-tb') || css.includes('writing-mode: horizontal-tb'),'texto vertical bloqueado');
assert(css.includes('overflow-x:hidden') || css.includes('overflow-x: hidden'),'overflow horizontal bloqueado');
assert(!home.includes('FLIGHTAWARE_AEROAPI_KEY'),'chave radar não exposta no frontend');
assert(!server.includes('ghp_') && !home.includes('ghp_') && !css.includes('ghp_'),'sem token GitHub hardcoded');
let changed=''; try{ changed=execSync('git diff --name-only main...HEAD',{encoding:'utf8'}); } catch { changed=execSync('git diff --name-only',{encoding:'utf8'}); }
assert(!changed.includes('client/src/lib/pdfParser.ts'),'pdfParser não foi alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'),'canonicalRoster não foi alterado');
assert(!changed.includes('client/src/lib/googleCalendarSync.ts'),'Google Calendar não foi alterado');
console.log('OK: CrewCheck v13.6.2 production emergency restore regression OK');
