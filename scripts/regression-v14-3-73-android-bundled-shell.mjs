import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const gradle = read('android-wrapper/app/build.gradle');
const main = read('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java');
const release = JSON.parse(read('client/public/release.json'));

assert.equal(release.version, '14.3.73', 'release.json deve anunciar v14.3.73 após o preparo');
assert.match(gradle, /generateCrewCheckOfflineAssets/, 'Gradle deve empacotar o dist canônico no APK/AAB');
assert.match(gradle, /main\.assets\.srcDir generatedCrewCheckAssets/, 'assets gerados devem entrar no sourceSet Android');
assert.match(gradle, /preBuild\.dependsOn generateCrewCheckOfflineAssets/, 'preBuild deve depender do bundle offline');
assert.match(gradle, /CrewCheck web dist ausente/, 'build deve falhar claramente se o Vite dist não existir');
assert.match(main, /CREWCHECK_BUNDLED_ASSET_PREFIX = "crewcheck"/, 'wrapper deve conhecer o prefixo dos assets empacotados');
assert.match(main, /shouldInterceptRequest\(WebView view, WebResourceRequest request\)/, 'wrapper deve interceptar requests estáticos');
assert.match(main, /serveBundledCrewCheckAsset\(request\)/, 'interceptor deve consultar o shell empacotado');
assert.match(main, /if \(path\.startsWith\("\/api\/"\)\) return null;/, 'API deve continuar indo para a rede, sem fixture local');
assert.match(main, /getAssets\(\)\.open\(assetPath\)/, 'assets devem ser servidos do APK/AAB');
assert.match(main, /loadCrewCheckEntryPoint\(webView\)/, 'primeiro frame deve passar pelo entry point protegido');
assert.doesNotMatch(main, /view\.loadUrl\("https:\/\/crewcheck\.online\?app=1"\)/, 'fallback não deve depender de reload direto da URL remota');

console.log('[regression-v14.3.73] Android bundled shell contract OK');
