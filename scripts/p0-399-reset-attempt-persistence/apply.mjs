import fs from 'node:fs';

const TAG = '[p0-399-reset-attempt-persistence]';
const authPath = 'server/v139/auth.mjs';
const regressionPath = 'scripts/regression-p0-legacy-identity-bridge.mjs';

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`${TAG} anchor not found: ${label}`);
  const next = source.replace(before, after);
  if (next === source) throw new Error(`${TAG} replacement failed: ${label}`);
  return next;
}

// #399 follow-up to v14.4.01.
//
// v14.4.01 correctly made crewcheck_platform_auth_artifacts the canonical source
// for password-reset consumption, but one security invariant was left knowingly
// weak: consumeAuthArtifact() increments attempts for a bad code on the caller's
// shared transaction, then resetPassword() rolled that same transaction back.
// The result was that wrong-code guesses through the real reset endpoint never
// accumulated toward the existing >=5 lockout.
//
// At the !consumed.ok branch no profile/account/password write has happened yet:
// resetPassword() has only taken FOR UPDATE locks and consumeAuthArtifact() may have
// incremented attempts. Committing that branch is therefore the narrowest safe fix:
// it persists only security bookkeeping (or a no-op for expired/used artifacts),
// releases the locks, and still returns the same non-enumerating public 400. A
// failure after a SUCCESSFUL consume still follows the outer catch/rollback path,
// so artifact consumption + identity/password writes remain atomic.

let auth = fs.readFileSync(authPath, 'utf8');
const authBefore = `    if (!consumed.ok) {
      await connection.rollback();
      return sendJson(res, 400, { ok: false, message: 'Código inválido ou expirado. Solicite outro.' });
    }`;
const authAfter = `    if (!consumed.ok) {
      // cc-p0-399-reset-attempt-persistence: before a successful consume there are
      // no identity/password writes to roll back. Commit the failed-attempt counter
      // written by consumeAuthArtifact(); for expired/used artifacts this is a no-op.
      await connection.commit();
      return sendJson(res, 400, { ok: false, message: 'Código inválido ou expirado. Solicite outro.' });
    }`;
auth = replaceOnce(auth, authBefore, authAfter, 'resetPassword invalid consume bookkeeping');
fs.writeFileSync(authPath, auth, 'utf8');

// Keep the existing end-to-end #399 regression authoritative after materialization.
// This repository intentionally tests the patch-chain output, so the follow-up slice
// updates the previous regression's documented trade-off together with the runtime
// behavior instead of leaving a test that blesses the known weakness.
let regression = fs.readFileSync(regressionPath, 'utf8');
const staticBefore = `assert.ok(
  resetPasswordSrc.includes('if (!consumed.ok) {\\n      await connection.rollback();\\n      return sendJson(res, 400, { ok: false, message: \\'Código inválido ou expirado. Solicite outro.\\' });\\n    }'),
  'falha no consumo do artifact deve fazer rollback e retornar a MESMA mensagem pública de sempre - sem novo formato de resposta e sem fallback',
);`;
const staticAfter = `assert.ok(
  resetPasswordSrc.includes('if (!consumed.ok) {\\n      // cc-p0-399-reset-attempt-persistence: before a successful consume there are\\n      // no identity/password writes to roll back. Commit the failed-attempt counter\\n      // written by consumeAuthArtifact(); for expired/used artifacts this is a no-op.\\n      await connection.commit();\\n      return sendJson(res, 400, { ok: false, message: \\'Código inválido ou expirado. Solicite outro.\\' });\\n    }'),
  'falha de código deve persistir apenas o bookkeeping de attempts antes de retornar a MESMA mensagem pública; nenhuma escrita de identidade é alcançável antes do consume válido',
);`;
regression = replaceOnce(regression, staticBefore, staticAfter, 'legacy bridge static invalid-consume assertion');

const tradeoffBefore = `  // Isso é verdade para consumeAuthArtifact() standalone (conexão própria, contrato
  // inalterado). Via resetPassword() especificamente, o incremento acontece dentro
  // da MESMA transação compartilhada que é revertida por inteiro em qualquer falha
  // (regra explícita do pedido: "se falhar, rollback"), então esse incremento é
  // desfeito junto com o resto - trade-off direto e intencional das regras 2/3
  // pedidas (consumeAuthArtifact nunca commita sozinho quando recebe uma conexão),
  // não uma lacuna deste patch. Documentado aqui, não escondido.`;
const tradeoffAfter = `  // consumeAuthArtifact() standalone continua persistindo attempts com conexão
  // própria. Via resetPassword(), o ramo de código inválido agora também persiste
  // SOMENTE esse bookkeeping antes de qualquer escrita de profile/account/senha,
  // fechando o bypass do limite de 5 tentativas sem enfraquecer a atomicidade do
  // caminho de sucesso (falhas depois de um consume válido ainda fazem rollback).`;
regression = replaceOnce(regression, tradeoffBefore, tradeoffAfter, 'legacy bridge scenario 3b documentation');

const expectationBefore = `    assert.equal(
      db.state.authArtifacts.find((a) => a.email === target).attempts,
      1,
      'via resetPassword() o incremento feito DENTRO da transação compartilhada é desfeito pelo rollback total em qualquer falha (regra 3 do pedido) - não sobe além do que já tinha sido persistido pela chamada standalone acima',
    );`;
const expectationAfter = `    assert.equal(
      db.state.authArtifacts.find((a) => a.email === target).attempts,
      2,
      'via resetPassword() o código errado deve persistir mais um attempts; o contador não pode ser apagado por rollback e deve acumular rumo ao limite de 5 tentativas',
    );`;
regression = replaceOnce(regression, expectationBefore, expectationAfter, 'legacy bridge scenario 3b persisted attempt');
fs.writeFileSync(regressionPath, regression, 'utf8');

console.log(`${TAG} invalid reset attempts persist without committing identity/password writes.`);
