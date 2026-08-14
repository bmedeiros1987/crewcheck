import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const applySource = fs.readFileSync('scripts/v14382/apply.mjs', 'utf8');

assert.ok(applySource.includes("response.headers.get('x-message-id')"), 'preparação terminal deve preservar x-message-id');
assert.ok(applySource.includes("response.headers.get('x-send-paused')"), 'preparação terminal deve preservar x-send-paused');
assert.ok(applySource.includes('const accepted = response.ok;'), 'aceite HTTP deve permanecer separado de entrega final');
assert.ok(applySource.includes('ok: accepted && !sendPaused'), 'envio pausado não pode ser tratado como sucesso efetivo');
assert.ok(!applySource.includes('Object.fromEntries(response.headers'), 'não copiar headers arbitrários do provedor');
assert.ok(!applySource.includes('...response.headers'), 'não espalhar headers arbitrários do provedor');
assert.ok(applySource.includes("const VERSION = '14.3.82';"), 'hardening não pode regredir o writer de versão atual');
assert.ok(applySource.includes('const VERSION_CODE = 140382;'), 'hardening não pode regredir versionCode aceito');

// Este teste valida apenas o writer terminal que introduz a correlação MailerSend.
// Não execute a cadeia histórica completa aqui: writers antigos podem não ser
// idempotentes contra um checkout já materializado e gerariam falso negativo
// antes de alcançar o comportamento que esta regressão pretende proteger.
const prepared = spawnSync(process.execPath, ['scripts/v14382/apply.mjs'], { encoding: 'utf8' });
assert.equal(prepared.status, 0, prepared.stderr || prepared.stdout || 'preparação terminal v14.3.82 falhou');

const delivery = fs.readFileSync('server/v139/delivery.mjs', 'utf8');
assert.ok(delivery.includes("response.headers.get('x-message-id')"), 'runtime preparado deve preservar x-message-id');
assert.ok(delivery.includes("response.headers.get('x-send-paused')"), 'runtime preparado deve preservar x-send-paused');
assert.ok(delivery.includes('messageId,'), 'runtime deve retornar messageId sanitizado');
assert.ok(delivery.includes('sendPaused,'), 'runtime deve retornar sendPaused normalizado');
assert.ok(delivery.includes('accepted,'), 'runtime deve distinguir provider accepted de sucesso efetivo');
assert.ok(!/response\.headers\.(entries|forEach)\s*\(/.test(delivery), 'runtime não deve enumerar/copiar headers arbitrários');

const second = spawnSync(process.execPath, ['scripts/v14382/apply.mjs'], { encoding: 'utf8' });
assert.equal(second.status, 0, second.stderr || second.stdout || 'segunda preparação terminal v14.3.82 falhou');
const deliveryAgain = fs.readFileSync('server/v139/delivery.mjs', 'utf8');
assert.equal(deliveryAgain, delivery, 'preparação terminal da correlação MailerSend deve ser idempotente');

console.log('[p1-mailersend-response-correlation] OK — x-message-id/x-send-paused preservados com allowlist e preparação terminal idempotente.');
