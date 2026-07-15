import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const packageMetadata = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
const expectedVersion = String(packageMetadata.version || '');

const port = 43157;
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: new URL('.', import.meta.url),
  env: { ...process.env, PORT: String(port), NODE_ENV: 'test', CREWCHECK_AUTH_REQUIRED: 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

const started = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Servidor não iniciou.')), 5000);
  child.stdout.on('data', (chunk) => {
    if (String(chunk).includes('listening')) {
      clearTimeout(timer);
      resolve();
    }
  });
  child.stderr.on('data', (chunk) => reject(new Error(String(chunk))));
  child.on('exit', (code) => reject(new Error(`Servidor encerrou com ${code}.`)));
});

try {
  await started;
  const paths = ['/api/health', '/api/platform/catalog', '/api/reliability/self-test', '/api/email/health', '/api/alarm/health', '/api/radar-health'];
  for (const path of paths) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    const payload = await response.json();
    if (!response.ok || typeof payload !== 'object') throw new Error(`${path} inválido`);
    if (path === '/api/health' && payload.version !== expectedVersion) throw new Error(`Versão incorreta: esperado ${expectedVersion}, recebido ${payload.version}`);
    if (path === '/api/platform/catalog') {
      if (payload.encoding !== 'UTF-8' || payload.defaultTimezone !== 'America/Sao_Paulo') throw new Error('Preferências de plataforma incorretas');
      if (!Array.isArray(payload.plans) || payload.plans.length !== 3 || payload.plans.some((plan) => plan.id === 'premium_unlimited')) throw new Error('Catálogo público deve ocultar Premium Unlimited');
      const premium = payload.plans.find((plan) => plan.id === 'premium_monthly');
      if (premium?.callLimit !== 20 || premium?.googlePlayProductId !== 'crewcheck_premium_monthly') throw new Error('Plano Premium incorreto');
    }
  }
  console.log('CrewCheck server routes smoke test OK');
} finally {
  child.kill('SIGTERM');
}
