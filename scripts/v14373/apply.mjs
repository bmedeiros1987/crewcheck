import fs from 'node:fs';

const VERSION = '14.3.74';
const VERSION_CODE = 140374;

function update(path, transform) {
  if (!fs.existsSync(path)) throw new Error(`[v14373] Arquivo ausente: ${path}`);
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v14373] Ponto não localizado: ${label}`);
  return source.replace(before, after);
}

update('android-wrapper/app/build.gradle', (source) => {
  let next = source;
  if (!next.includes('generatedCrewCheckAssets')) {
    next = replaceRequired(
      next,
      'def generatedCrewCheckRes = file("$buildDir/generated/res/crewcheckBrand")',
      'def generatedCrewCheckRes = file("$buildDir/generated/res/crewcheckBrand")\ndef generatedCrewCheckAssets = file("$buildDir/generated/assets/crewcheckOffline")',
      'diretório de assets offline',
    );
  }

  if (!next.includes("tasks.register('generateCrewCheckOfflineAssets')")) {
    const marker = "tasks.register('generateCrewCheckBrandAssets') {";
    const insert = `tasks.register('generateCrewCheckOfflineAssets') {\n    inputs.dir(file('../../dist'))\n    outputs.dir(file(\"$generatedCrewCheckAssets/crewcheck\"))\n    doLast {\n        def sourceDir = file('../../dist')\n        def indexFile = file('../../dist/index.html')\n        if (!indexFile.exists()) {\n            throw new GradleException('CrewCheck web dist ausente. Execute npx vite build antes do Gradle release.')\n        }\n        def targetDir = file(\"$generatedCrewCheckAssets/crewcheck\")\n        delete targetDir\n        targetDir.mkdirs()\n        copy {\n            from sourceDir\n            into targetDir\n        }\n    }\n}\n\n`;
    if (!next.includes(marker)) throw new Error('[v14373] Bloco de assets de marca não encontrado.');
    next = next.replace(marker, insert + marker);
  }

  if (!next.includes('main.assets.srcDir generatedCrewCheckAssets')) {
    next = replaceRequired(
      next,
      '        main.res.srcDir generatedCrewCheckRes',
      '        main.res.srcDir generatedCrewCheckRes\n        main.assets.srcDir generatedCrewCheckAssets',
      'sourceSet de assets offline',
    );
  }

  if (!next.includes('preBuild.dependsOn generateCrewCheckOfflineAssets')) {
    next = replaceRequired(
      next,
      'preBuild.dependsOn generateCrewCheckBrandAssets',
      'preBuild.dependsOn generateCrewCheckBrandAssets\npreBuild.dependsOn generateCrewCheckOfflineAssets',
      'dependência de preparo offline',
    );
  }

  return next
    .replace(/versionCode\s+\d+/, `versionCode ${VERSION_CODE}`)
    .replace(/versionName\s+['\"][^'\"]+['\"]/, `versionName \"${VERSION}\"`);
});

update('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java', (source) => {
  let next = source;
  if (!next.includes('CREWCHECK_BUNDLED_ASSET_PREFIX')) {
    next = replaceRequired(
      next,
      '    private static final int MAX_PDF_BYTES = 35 * 1024 * 1024;',
      '    private static final int MAX_PDF_BYTES = 35 * 1024 * 1024;\n    private static final String CREWCHECK_REMOTE_URL = \"https://crewcheck.online?app=1\";\n    private static final String CREWCHECK_BUNDLED_ASSET_PREFIX = \"crewcheck\";',
      'constantes de shell offline',
    );
  }

  next = next.replace(
    '                    if (isCrewCheckWebUrl(target)) return false;',
    '                    if (isCrewCheckWebUrl(target)) return false;',
  );

  if (!next.includes('WebResourceResponse bundled = serveBundledCrewCheckAsset(request);')) {
    const marker = '            @Override\n            public void onPageFinished(WebView view, String url) {';
    const method = `            @Override\n            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {\n                WebResourceResponse bundled = serveBundledCrewCheckAsset(request);\n                if (bundled != null) return bundled;\n                return super.shouldInterceptRequest(view, request);\n            }\n\n`;
    if (!next.includes(marker)) throw new Error('[v14373] WebViewClient onPageFinished não encontrado.');
    next = next.replace(marker, method + marker);
  }

  next = next.replace(
    '                        view.getSettings().setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);\n                        view.loadUrl("https://crewcheck.online?app=1");',
    '                        view.getSettings().setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);\n                        loadCrewCheckEntryPoint(view);',
  );

  next = next.replace(
    '        webView.loadUrl("https://crewcheck.online?app=1");',
    '        loadCrewCheckEntryPoint(webView);',
  );

  if (!next.includes('private WebResourceResponse serveBundledCrewCheckAsset(')) {
    const marker = '\n\n\n    private void requestInitialCrewCheckPermissions() {';
    const helpers = `\n\n    private void loadCrewCheckEntryPoint(WebView target) {\n        if (target == null) return;\n        target.loadUrl(CREWCHECK_REMOTE_URL);\n    }\n\n    private WebResourceResponse serveBundledCrewCheckAsset(WebResourceRequest request) {\n        if (request == null || request.getUrl() == null) return null;\n        try {\n            Uri uri = request.getUrl();\n            String host = uri.getHost();\n            if (host == null || !host.equalsIgnoreCase(\"crewcheck.online\")) return null;\n            if (!\"GET\".equalsIgnoreCase(request.getMethod())) return null;\n\n            String path = uri.getPath();\n            if (path == null || path.isEmpty() || \"/\".equals(path)) path = \"/index.html\";\n            if (path.startsWith(\"/api/\")) return null;\n            if (path.contains(\"..\")) return null;\n\n            String assetPath = CREWCHECK_BUNDLED_ASSET_PREFIX + path;\n            InputStream input = getAssets().open(assetPath);\n            String lower = path.toLowerCase(Locale.ROOT);\n            String mime = lower.endsWith(\".html\") ? \"text/html\"\n                    : lower.endsWith(\".js\") ? \"application/javascript\"\n                    : lower.endsWith(\".css\") ? \"text/css\"\n                    : lower.endsWith(\".json\") ? \"application/json\"\n                    : lower.endsWith(\".svg\") ? \"image/svg+xml\"\n                    : lower.endsWith(\".png\") ? \"image/png\"\n                    : lower.endsWith(\".webp\") ? \"image/webp\"\n                    : lower.endsWith(\".jpg\") || lower.endsWith(\".jpeg\") ? \"image/jpeg\"\n                    : lower.endsWith(\".woff2\") ? \"font/woff2\"\n                    : \"application/octet-stream\";\n            return new WebResourceResponse(mime, lower.endsWith(\".html\") || lower.endsWith(\".js\") || lower.endsWith(\".css\") || lower.endsWith(\".json\") ? \"UTF-8\" : null, input);\n        } catch (Exception ignored) {\n            return null;\n        }\n    }\n`;
    if (!next.includes(marker)) throw new Error('[v14373] Ponto de inserção dos helpers Android não encontrado.');
    next = next.replace(marker, helpers + marker);
  }

  return next;
});

update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - Android bundled offline shell`;
  return `${JSON.stringify(data, null, 2)}\n`;
});

update('client/src/pages/Home.tsx', (source) => source
  .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
  .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: shell Android empacotado para abertura resiliente';`));

update('client/src/App.tsx', (source) => source
  .replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`)
  .replace(/crewcheck-client-cleanup:[^']+/g, `crewcheck-client-cleanup:${VERSION}`));

update('server.mjs', (source) => source.replace(/(app\s*:\s*'CrewCheck',\s*version\s*:\s*)'[^']+'/g, `$1'${VERSION}'`));
update('server/platform.mjs', (source) => source.replace(/(app\s*:\s*'CrewCheck',\s*version\s*:\s*)'[^']+'/g, `$1'${VERSION}'`));

update('client/public/release.json', () => `${JSON.stringify({
  version: VERSION,
  channel: 'web',
  updatePolicy: 'automatic-safe',
  notes: 'APK/AAB passam a empacotar o shell Web canônico e servi-lo no mesmo origin, preservando APIs online e abertura resiliente.',
}, null, 2)}\n`);

update('client/public/manual.html', (source) => source
  .replace(/Manual CrewCheck v\d+\.\d+\.\d+/g, `Manual CrewCheck v${VERSION}`)
  .replace(/CrewCheck v\d+\.\d+\.\d+/g, `CrewCheck v${VERSION}`)
  .replace(/Última revisão: CrewCheck v\d+\.\d+\.\d+/g, `Última revisão: CrewCheck v${VERSION}`));

console.log(`[v14373] CrewCheck ${VERSION}: shell Android canônico empacotado para abertura resiliente; manual alinhado à release canônica.`);
