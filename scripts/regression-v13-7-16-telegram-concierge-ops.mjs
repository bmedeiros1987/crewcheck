import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const serverPath = path.join(root, 'server.mjs');
const parserPath = path.join(root, 'server', 'rosterParser.mjs');
const homePath = path.join(root, 'client', 'src', 'pages', 'Home.tsx');
const snapshotPath = path.join(root, '.crewcheck-telegram-rosters.json');
const originalSnapshot = fs.existsSync(snapshotPath) ? fs.readFileSync(snapshotPath) : null;
const serverSource = fs.readFileSync(serverPath, 'utf8');
const parserSource = fs.readFileSync(parserPath, 'utf8');
const homeSource = fs.readFileSync(homePath, 'utf8');

function check(condition, message) {
  if (!condition) throw new Error(message);
}

check(serverSource.includes("import { parsePdfOnServer } from './server/rosterParser.mjs'"), 'Parser de PDF não conectado ao servidor.');
check(serverSource.includes("url.pathname === '/api/parse-pdf'"), 'Rota /api/parse-pdf ausente.');
check(serverSource.includes("url.pathname === '/api/telegram/concierge/ask'"), 'Rota de consulta do Concierge ausente.');
check(serverSource.includes('handleTelegramPdfRoster(message)'), 'Webhook não processa PDF.');
check(serverSource.includes('handleTelegramLocation(message)'), 'Webhook não processa localização.');
check(serverSource.includes('conciergeApplyRadar'), 'Radar não exporta dados ao snapshot.');
check(serverSource.includes('telegramAppRequestAllowed'), 'Proteção de identidade do Concierge ausente.');
check(serverSource.includes('crewcheck_telegram_state'), 'Persistência PostgreSQL do Concierge ausente.');
check(parserSource.includes('parseServerAims') && parserSource.includes('parseServerRosterReport'), 'Compatibilidade AIMS/CrewRoster ausente.');
check(homeSource.includes("'concierge'"), 'Tela Concierge não registrada.');
check(homeSource.includes('Enviar ou importar pelo Telegram'), 'Importação por Telegram não exposta.');
check(homeSource.includes('crewcheck:gym-provider-plan'), 'Filtro de plano de academia ausente.');
check(homeSource.includes('GoogleMapsRoutePreview event={event} mode={mode}'), 'Saída Inteligente sem prévia integrada por modo.');

const now = new Date();
const tomorrow = new Date(now.getTime() + 86_400_000);
const day = String(tomorrow.getDate()).padStart(2, '0');
const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
const year = tomorrow.getFullYear();
const port = 45_000 + Math.floor(Math.random() * 1_000);
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), NODE_ENV: 'test', CREWCHECK_AUTH_REQUIRED: 'false' },
  stdio: ['ignore', 'ignore', 'pipe'],
});

async function waitForServer() {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError || new Error('Servidor de regressão não iniciou.');
}

try {
  await waitForServer();
  const identity = { email: 'regression-concierge@crewcheck.local', name: 'Regressão' };
  const roster = {
    crewName: 'Regressão CrewCheck',
    base: 'BSB',
    month: Number(month),
    year,
    rawText: 'este texto não pode ser persistido',
    days: [{
      date: `${day}/${month}/${year}`,
      dayNumber: Number(day),
      month: Number(month),
      year,
      type: 'VOO',
      pairingCode: 'LA9001',
      dutyReport: '06:10',
      dutyDebrief: '10:30',
      rawText: 'linha sensível do PDF',
      legs: [{ flightNumber: 'LA9001', origin: 'BSB', destination: 'GRU', departureTime: '07:10', arrivalTime: '09:00' }],
    }],
  };
  const syncResponse = await fetch(`http://127.0.0.1:${port}/api/telegram/roster-sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...identity, roster, source: 'regression' }),
  });
  const synced = await syncResponse.json();
  check(syncResponse.ok && synced.ok && synced.diagnostics.flights === 1, 'Sincronização da escala falhou.');

  const askResponse = await fetch(`http://127.0.0.1:${port}/api/telegram/concierge/ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...identity, text: '/proximo' }),
  });
  const answer = await askResponse.json();
  check(answer.ok && /LA9001/.test(answer.reply) && /BSB/.test(answer.reply), 'Comando /proximo não usa a escala real.');

  const params = new URLSearchParams(identity);
  const rosterResponse = await fetch(`http://127.0.0.1:${port}/api/telegram/roster?${params}`);
  const snapshot = await rosterResponse.json();
  check(snapshot.ok && snapshot.snapshot?.roster?.days?.length === 1, 'Escala do Telegram não pode ser recuperada.');
  check(snapshot.snapshot.roster.rawText === '' && snapshot.snapshot.roster.days[0].rawText === '', 'Texto bruto do PDF foi persistido.');

  const healthResponse = await fetch(`http://127.0.0.1:${port}/api/telegram/health`);
  const health = await healthResponse.json();
  check(health.pdfImport === true && health.rosterSync === true && health.commandsRestored === true, 'Health do Concierge incompleto.');

  const parserResponse = await fetch(`http://127.0.0.1:${port}/api/parse-pdf`);
  const parserHealth = await parserResponse.json();
  check(parserHealth.parser === 'AIMS + CrewRosterReport', 'Health do parser não reconhece os formatos restaurados.');
  console.log('CrewCheck v13.7.16 — Concierge Telegram e operações conectadas: OK');
} finally {
  child.kill('SIGTERM');
  if (originalSnapshot) fs.writeFileSync(snapshotPath, originalSnapshot);
  else if (fs.existsSync(snapshotPath)) fs.rmSync(snapshotPath);
}
