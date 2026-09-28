import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync('server.mjs', 'utf8');
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');

const start = server.indexOf('async function tomtomIncidentDetails(route, key)');
const end = server.indexOf('async function tomtomRoutePreview(origin, destination, key)', start);
assert.ok(start >= 0 && end > start, 'bloco TomTom de incidentes deve existir');
const incidentBlock = server.slice(start, end);

assert.ok(incidentBlock.includes("endpoint.searchParams.set('timeValidityFilter', 'present');"), 'TomTom deve solicitar somente ocorrências presentes');
assert.ok(incidentBlock.includes("const timeValidity = String(properties.timeValidity || '').trim().toLowerCase();"), 'servidor deve normalizar timeValidity');
assert.ok(incidentBlock.includes("const endTimestamp = endTime ? Date.parse(endTime) : Number.NaN;"), 'servidor deve interpretar endTime quando disponível');
assert.match(incidentBlock, /timeValidity && timeValidity !== 'present'/, 'estado não presente deve ser descartado');
assert.match(incidentBlock, /Number\.isFinite\(endTimestamp\) && endTimestamp <= now/, 'ocorrência com endTime passado deve ser descartada');
assert.match(incidentBlock, /encerrad\[oa\]/, 'descrição terminal localizada deve ser descartada defensivamente');
assert.ok(incidentBlock.includes("timeValidity: timeValidity || 'present'"), 'contrato deve preservar a validade temporal');
assert.ok(incidentBlock.includes("startTime: String(properties.startTime || '')"), 'contrato deve preservar startTime');
assert.ok(incidentBlock.includes('endTime,'), 'contrato deve preservar endTime');
assert.ok(home.includes('timeValidity?: string; startTime?: string; endTime?: string'), 'cliente deve tipar metadados temporais do incidente');

console.log('[p0-maps-terminal-incidents] OK — ocorrências encerradas não chegam ao card, toast ou notificação da rota.');
