import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, unlink } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const out = path.resolve('.tv-brand-test-tmp.mjs');
try {
  await build({ entryPoints:['apps/tv-player/src/presentation.ts'], outfile:out, bundle:true, platform:'node', format:'esm' });
  const {weatherArt, formatTvTime, formatMonth, activityLabel} = await import(pathToFileURL(out).href);
  const cases = [[null,'unknown'],['','unknown'],['Dados indisponíveis','unknown'],['Aguardando dados confirmados','unknown'],['26 graus','unknown'],['Sem chuva','unknown'],['no rain','unknown'],['Céu limpo','sun'],['Parcialmente nublado','partly'],['Céu parcialmente nublado','partly'],['Partly cloudy','partly'],['Encoberto','cloud'],['Chuva fraca','rain'],['Light rain','rain'],['Trovoadas','storm'],['Neve','snow'],['Nevoeiro','fog'],['Ventoso','wind']];
  for(const [input, expected] of cases) assert.equal(weatherArt(input),expected,String(input));
  assert.equal(formatTvTime('bad-date'),'—'); assert.equal(formatTvTime(null),'—');
  assert.equal(formatTvTime('2026-09-18T19:25:00Z'),'16:25');
  assert.equal(formatMonth('2026-09'),'Setembro 2026'); assert.equal(formatMonth('2026-13'),'Escala');
  assert.equal(activityLabel(null),'Sem programação'); assert.equal(activityLabel({kind:'duty',publishedCode:'OFF'}),'Folga');
  assert.equal(activityLabel({kind:'duty',publishedCode:'HSB'}),'Sobreaviso'); assert.equal(activityLabel({kind:'rest',publishedCode:'DR'}),'Descanso');
  const main=await readFile('apps/tv-player/src/main.tsx','utf8'), css=await readFile('apps/tv-player/src/tv.css','utf8'), icons=await readFile('apps/tv-player/src/TvVisuals.tsx','utf8');
  assert.ok(main.indexOf('SAIR DE CASA') < main.indexOf('APRESENTAÇÃO'));
  assert.ok(icons.includes("client/public/icons/crewcheck-icon-v2.png"));
  assert.ok(main.includes("client/src/lib/brand"));
  assert.ok(css.includes('[data-motion=off]')); assert.ok(css.includes('prefers-reduced-motion')); assert.ok(css.includes('[data-paused=true]'));
  assert.doesNotMatch(css,/display:\s*grid\b/); assert.doesNotMatch(css,/(?:^|[;{])\s*gap\s*:/);
  assert.ok(main.includes("if (demo) { clear(); return; }"));
  assert.ok(main.includes('next?.presentation')); assert.ok(main.includes('currentFact(snapshot?.weather'));
  assert.doesNotMatch(main,/departureTime|dutyReport|parsePDF/);
  console.log('TV brand: 18 weather cases + time/month/labels + source/brand/motion/scope guards passed');
} finally { await unlink(out).catch(()=>{}); }
