import fs from 'node:fs';
import { hasReleaseWatcher } from '../lib/release-watcher.mjs';

const VERSION = '14.3.29';
const VERSION_DIGITS = VERSION.replace(/\./g, '');

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14329] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v14329] Ponto de aplicação não localizado: ${label}`);
  return source.replace(before, after);
}

update('client/src/pages/Home.tsx', (source) => {
  let next = source
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: Saída Inteligente com margem real de chegada e atualização automática confirmável';`);

  next = replaceRequired(
    next,
    "  const [margin, setMargin] = useState(() => Number(storage.get('crewcheck_departure_margin', '35')) || 35);",
    [
      "  const [margin, setMargin] = useState(() => {",
      "    const raw = Number(storage.get('crewcheck_departure_margin', ''));",
      "    const migrated = storage.get('crewcheck_departure_margin_v14329_migrated', '0') === '1';",
      "    const allowed = [15, 20, 25, 30, 40, 60];",
      "    const nextMargin = !migrated && (!Number.isFinite(raw) || raw <= 0 || raw === 35) ? 15 : allowed.includes(raw) ? raw : 15;",
      "    storage.set('crewcheck_departure_margin', String(nextMargin));",
      "    storage.set('crewcheck_departure_margin_v14329_migrated', '1');",
      "    return nextMargin;",
      "  });",
    ].join('\n'),
    'margem padrão da Saída Inteligente',
  );

  next = replaceRequired(
    next,
    "  function chooseMargin(next: number) { setMargin(next); storage.set('crewcheck_departure_margin', String(next)); }",
    "  function chooseMargin(next: number) { setMargin(next); storage.set('crewcheck_departure_margin', String(next)); storage.set('crewcheck_departure_margin_v14329_migrated', '1'); }",
    'persistência explícita da margem',
  );

  next = replaceRequired(
    next,
    "  const marginMinutes = Math.max(0, Math.min(180, Number.isFinite(Number(margin)) ? Math.round(Number(margin)) : 35));",
    "  const marginMinutes = Math.max(15, Math.min(60, Number.isFinite(Number(margin)) ? Math.round(Number(margin)) : 15));",
    'limites da margem operacional',
  );

  next = replaceRequired(
    next,
    "  const leadMinutes = Math.max(45, travelMinutes + marginMinutes);",
    "  const leadMinutes = travelMinutes + marginMinutes;",
    'cálculo sem antecedência oculta de 45 minutos',
  );

  next = replaceRequired(
    next,
    "A saída nunca fica igual à apresentação: mesmo sem resposta do trânsito, o CrewCheck usa uma estimativa protegida e mantém pelo menos 45 minutos de antecedência total.",
    "A saída considera o tempo real ou protegido de deslocamento e planeja a chegada ao aeroporto com a margem escolhida. O padrão é 15 minutos antes da apresentação.",
    'explicação da margem real',
  );

  next = replaceRequired(
    next,
    "{[15, 25, 35, 45].map((value) =>",
    "{[15, 20, 25, 30, 40, 60].map((value) =>",
    'opções de margem operacional',
  );

  return next;
}, { optional: true });

update('client/src/App.tsx', (source) => source.replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`), { optional: true });
update('client/src/pages/AuthPage.tsx', (source) => source.replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`).replace(/data-version="[^"]+"/g, `data-version="${VERSION}"`), { optional: true });

update('client/index.html', (source) => {
  let next = source
    .replace(/data-crewcheck-release="[^"]+"/, `data-crewcheck-release="${VERSION}"`)
    .replace(/<meta name="crewcheck-release" content="[^"]+"\s*\/>/, `<meta name="crewcheck-release" content="${VERSION}" />`)
    .replace(/crewcheck-cache-reset-[^']+/, `crewcheck-cache-reset-${VERSION.replace(/\./g, '-')}`)
    .replace(/manifest\.json\?v=[^"']+/, `manifest.json?v=${VERSION_DIGITS}`)
    .replace(/crewcheck-auto-update-v\d+/, 'crewcheck-auto-update-v14329')
    .replace(/\/sw\.js\?v=\d+/, `/sw.js?v=${VERSION_DIGITS}`);

  if (!hasReleaseWatcher(next)) {
    const watch = [
      '  <script id="crewcheck-release-watch-v14329">',
      '    (function () {',
      `      var currentRelease = '${VERSION}';`,
      '      var checking = false;',
      '      async function checkRelease() {',
      '        if (checking) return;',
      '        checking = true;',
      '        try {',
      "          var response = await fetch('/release.json?ts=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' });",
      '          if (!response.ok) return;',
      '          var payload = await response.json().catch(function () { return {}; });',
      "          var serverRelease = String(payload.version || '');",
      '          if (!serverRelease || serverRelease === currentRelease) return;',
      "          var reloadKey = 'crewcheck-release-reload:' + serverRelease;",
      "          if (window.sessionStorage && window.sessionStorage.getItem(reloadKey) === 'done') return;",
      "          if ('serviceWorker' in navigator) {",
      '            var registration = await navigator.serviceWorker.getRegistration();',
      '            if (registration) {',
      '              await registration.update().catch(function () {});',
      "              if (registration.waiting) registration.waiting.postMessage('SKIP_WAITING');",
      '            }',
      '          }',
      "          if (window.sessionStorage) window.sessionStorage.setItem(reloadKey, 'done');",
      '          window.location.reload();',
      '        } catch (error) {',
      '        } finally {',
      '          checking = false;',
      '        }',
      '      }',
      "      window.addEventListener('load', checkRelease);",
      "      document.addEventListener('visibilitychange', function () { if (!document.hidden) checkRelease(); });",
      '      window.setInterval(checkRelease, 300000);',
      '    })();',
      '  </script>',
    ].join('\n');
    next = next.replace('</body>', `${watch}\n</body>`);
  }
  return next;
});

update('client/public/sw.js', (source) => source
  .replace(/const CACHE_NAME = '[^']+';/, `const CACHE_NAME = 'crewcheck-v${VERSION}-shell';`)
  .replace(/const RUNTIME_CACHE = '[^']+';/, `const RUNTIME_CACHE = 'crewcheck-v${VERSION}-runtime';`));

fs.writeFileSync('client/public/release.json', `${JSON.stringify({ version: VERSION, channel: 'web', updatePolicy: 'automatic' }, null, 2)}\n`, 'utf8');

console.log(`[v14329] CrewCheck Web ${VERSION}: margem de chegada corrigida, identidade do cliente atualizada e verificação automática ativada sem alterar a versão nativa do AAB.`);
