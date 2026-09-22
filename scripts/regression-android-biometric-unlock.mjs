import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const gradle = read('android-wrapper/app/build.gradle');
const manifest = read('android-wrapper/app/src/main/AndroidManifest.xml');
const activity = read('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java');
const vault = read('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckBiometricVault.java');
const authPage = read('client/src/pages/AuthPage.tsx');
const authClient = read('client/src/lib/authClient.ts');
const app = read('client/src/App.tsx');
const bridge = read('client/src/lib/androidBiometric.ts');

assert.match(gradle, /androidx\.biometric:biometric:1\.1\.0/, 'AndroidX Biometric deve estar no app');
assert.match(manifest, /android\.permission\.USE_BIOMETRIC/, 'Manifest deve declarar USE_BIOMETRIC');
assert.match(activity, /extends FragmentActivity/, 'MainActivity deve suportar BiometricPrompt AndroidX');
assert.match(activity, /BiometricManager\.Authenticators\.BIOMETRIC_STRONG/, 'Prompt deve exigir biometria forte');
assert.match(activity, /enableBiometric\(final String token\)/, 'bridge deve permitir enrollment apenas com token de sessão');
assert.match(activity, /unlockBiometric\(\)/, 'bridge deve permitir unlock biométrico');
assert.match(activity, /disableBiometric\(\)/, 'bridge deve permitir revogação local');

assert.match(vault, /AndroidKeyStore/, 'credencial deve usar Android Keystore');
assert.match(vault, /AES\/GCM\/NoPadding/, 'token deve ser cifrado com AES-GCM');
assert.match(vault, /setUserAuthenticationRequired\(true\)/, 'chave deve exigir autenticação do usuário');
assert.match(vault, /AUTH_BIOMETRIC_STRONG/, 'chave deve estar vinculada a biometria forte');
assert.match(vault, /setInvalidatedByBiometricEnrollment\(true\)/, 'nova biometria cadastrada deve invalidar a chave');
assert.doesNotMatch(vault, /putString\([^\n]*password/i, 'vault nunca pode armazenar senha');
assert.doesNotMatch(vault, /KEY_PASSWORD|password_hash|password_salt/, 'vault não pode conhecer credenciais de senha');

assert.match(authPage, /Entrar com biometria/, 'login deve expor CTA biométrico');
assert.match(authPage, /Sua senha não será armazenada/, 'opt-in deve explicar que senha não é salva');
assert.match(authPage, /enableAndroidBiometric\(session\.token\)/, 'enrollment deve proteger somente token da sessão atual');
assert.match(authPage, /restoreBiometricSession\(result\.token\)/, 'unlock deve restaurar sessão validada pelo backend');

assert.match(authClient, /disableNativeBiometricCredential\(\);\s*clearSession\(\)/s, 'logout deve revogar vault antes de limpar sessão web');
assert.match(authClient, /restoreBiometricSession/, 'auth client deve validar token restaurado com getMe');
assert.match(app, /biometric\.enabled && !biometric\.unlocked/, 'Android deve bloquear sessão web até biometria na nova abertura');
assert.match(app, /expireSession\(\);\s*setLocation\('\/login\?biometric=1'\)/s, 'lock deve remover só token web e abrir login biométrico');

assert.match(bridge, /45_000/, 'prompt web deve ter timeout e não ficar pendurado');
assert.match(bridge, /crewcheck:biometric-result/, 'resultado nativo deve usar evento dedicado');

console.log('[android-biometric] contratos de segurança e unlock OK');
