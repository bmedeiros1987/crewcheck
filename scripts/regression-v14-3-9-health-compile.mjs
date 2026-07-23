import fs from 'node:fs';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[v1439-regression] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

const mainActivity = read('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java');
const lifeView = read('client/src/components/v1434/CrewCheckLifeView.tsx');
const androidBuild = read('android-wrapper/app/build.gradle');
const packageJson = JSON.parse(read('package.json'));

if (mainActivity.includes('BuildConfig.VERSION_NAME')) throw new Error('MainActivity ainda usa BuildConfig.VERSION_NAME.');
if (!mainActivity.includes('getPackageManager().getPackageInfo(getPackageName(), 0).versionName')) throw new Error('Versão nativa compilável ausente.');
if (!mainActivity.includes('window.CrewCheckHealth={')) throw new Error('Fachada CrewCheckHealth ausente.');
if (!mainActivity.includes('public boolean healthBridgePostMessage(final String raw)')) throw new Error('Fallback Health Connect ausente.');
if (!lifeView.includes('const stable = (window as any).CrewCheckHealth')) throw new Error('Cliente não usa fachada estável.');
if (!lifeView.includes('Instale a versão 14.3.9.')) throw new Error('Diagnóstico v14.3.9 ausente.');
if (!/versionCode\s+140309/.test(androidBuild)) throw new Error('versionCode 140309 ausente.');
if (!/versionName\s+["']14\.3\.9["']/.test(androidBuild)) throw new Error('versionName 14.3.9 ausente.');
if (packageJson.version !== '14.3.9') throw new Error(`package.json esperado 14.3.9, recebido ${packageJson.version}`);

console.log('[v1439-regression] Health Connect compilável, fachada estável e versão 14.3.9 confirmados.');
