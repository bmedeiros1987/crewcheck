import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');

assert.match(home, /function smartDepartureEligible[\s\S]*event\.kind === 'flight'[\s\S]*'ASB'[\s\S]*'HSB'[\s\S]*'RCFI'/, 'elegibilidade deve cobrir voo, reserva, sobreaviso e treinamento');
assert.match(home, /if \(!smartDepartureEligible\(event\)\) return null;/, 'FlyDeck não deve oferecer saída para atividade inelegível');
assert.match(home, /Esta programação não exige planejamento de saída/, 'rota direta deve falhar com estado humano e seguro');
assert.match(home, /route\?\.ok && embedUrl \? <iframe[\s\S]*Mapa estático aguardando configuração/, 'iframe do provedor só deve abrir após rota válida');
assert.doesNotMatch(home, /Google Maps Platform rejected/, 'interface não pode carregar erro técnico conhecido');

console.log('[v14.3.84] OK — Saída Inteligente respeita elegibilidade e esconde falhas técnicas do mapa.');
