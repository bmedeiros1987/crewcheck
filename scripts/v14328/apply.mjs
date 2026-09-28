import fs from 'node:fs';

const VERSION = '14.3.28';

const indexPath = 'client/index.html';
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf8');
  html = html
    .replace(/data-crewcheck-release="[^"]+"/, `data-crewcheck-release="${VERSION}"`)
    .replace(/<meta name="crewcheck-release" content="[^"]+"\s*\/>/, `<meta name="crewcheck-release" content="${VERSION}" />`)
    .replace(/crewcheck-cache-reset-[^']+/, `crewcheck-cache-reset-${VERSION.replace(/\./g, '-')}`)
    .replace(/manifest\.json\?v=[^"']+/, `manifest.json?v=${VERSION.replace(/\./g, '')}`);
  if (!html.includes('crewcheck-auto-update-v14328')) {
    html = html.replace('</body>', `  <script id="crewcheck-auto-update-v14328">\n    (function () {\n      if (!('serviceWorker' in navigator)) return;\n      window.addEventListener('load', function () {\n        navigator.serviceWorker.register('/sw.js?v=${VERSION.replace(/\./g, '')}', { updateViaCache: 'none' }).then(function (registration) {\n          registration.update().catch(function () {});\n          if (registration.waiting) registration.waiting.postMessage('SKIP_WAITING');\n          registration.addEventListener('updatefound', function () {\n            var worker = registration.installing;\n            if (!worker) return;\n            worker.addEventListener('statechange', function () {\n              if (worker.state === 'installed' && navigator.serviceWorker.controller) worker.postMessage('SKIP_WAITING');\n            });\n          });\n        }).catch(function () {});\n        var reloaded = false;\n        navigator.serviceWorker.addEventListener('controllerchange', function () {\n          if (reloaded) return;\n          reloaded = true;\n          window.location.reload();\n        });\n      });\n    })();\n  </script>\n</body>`);
  }
  fs.writeFileSync(indexPath, html, 'utf8');
}

const swPath = 'client/public/sw.js';
if (fs.existsSync(swPath)) {
  let sw = fs.readFileSync(swPath, 'utf8');
  sw = sw
    .replace(/const CACHE_NAME = '[^']+';/, `const CACHE_NAME = 'crewcheck-v${VERSION}-shell';`)
    .replace(/const RUNTIME_CACHE = '[^']+';/, `const RUNTIME_CACHE = 'crewcheck-v${VERSION}-runtime';`);
  fs.writeFileSync(swPath, sw, 'utf8');
}

console.log(`[v14328] Atualização automática do cliente e invalidação de cache aplicadas para ${VERSION}.`);
