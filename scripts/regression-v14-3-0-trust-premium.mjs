import fs from 'node:fs';

const required = {
  'client/src/pages/Home.tsx': [
    'function crewcheckPlanExperience',
    'function ReliabilityAliveCard',
    'function PremiumValueBridge',
    'function MeteoFollowPanel',
    "const DEFAULT_VERSION = '14.3.0';",
    "view === 'alerts' && <><ReliabilityAliveCard",
    "view === 'weather' && <><MeteoFollowPanel",
  ],
  'client/src/main.tsx': ['v1430/trust-and-conversion.css'],
  'client/src/components/v1430/trust-and-conversion.css': [
    '.cc-reliability-alive',
    '.cc-premium-value-bridge',
    '.cc-meteo-follow',
    'overflow-wrap:anywhere',
  ],
  'package.json': ['14.3.0', 'regression:v14.3.0'],
};

for (const [path, markers] of Object.entries(required)) {
  if (!fs.existsSync(path)) throw new Error(`[v14.3.0] Arquivo ausente: ${path}`);
  const source = fs.readFileSync(path, 'utf8');
  for (const marker of markers) if (!source.includes(marker)) throw new Error(`[v14.3.0] Marcador ausente em ${path}: ${marker}`);
}

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
if (!home.includes('O gratuito continua confiável. O Premium acompanha você.')) throw new Error('[v14.3.0] Mensagem ética de conversão não encontrada.');
if (!home.includes('Você será avisado somente quando houver nova emissão.')) throw new Error('[v14.3.0] Proteção contra excesso de notificações meteorológicas ausente.');
if (!home.includes('Madrugadas em 168 h')) throw new Error('[v14.3.0] Transparência de madrugadas em 168 horas ausente.');
console.log('[v14.3.0] Regressão concluída: gratuito confiável, Premium natural, motor visível e METAR/TAF acompanhado.');
