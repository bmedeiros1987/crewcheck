import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// #399 legacy identity bridge (v14.4.00): a legacy crewcheck_users row with no
// current crewcheck_platform_profiles/accounts row must never get a modern account
// created just because its email matches - the modern identity is only ever
// materialized after the user proves possession of that email through the SAME
// single-use code flow already used for every other password reset
// (requestReset()/resetPassword()). This regression never runs the real roster
// recovery; ownership of any legacy roster is preserved purely because this bridge
// never references crewcheck_rosters/crewcheck_platform_rosters at all.

const source = fs.readFileSync('server/v139/auth.mjs', 'utf8').replace(/\r\n/g, '\n');

function extractFunction(name) {
  const marker = `function ${name}(`;
  let start = source.indexOf(marker);
  assert.ok(start >= 0, `${name}() não encontrada em server/v139/auth.mjs`);
  if (source.slice(Math.max(0, start - 6), start) === 'async ') start -= 6;
  const braceOpen = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceOpen; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name}() nunca fecha`);
}

function extractConst(name) {
  const marker = `const ${name} = `;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} não encontrada em server/v139/auth.mjs`);
  const valueStart = start + marker.length;
  const first = source[valueStart];
  let end;
  if (first === '[' || first === '{' || source.startsWith('new Set(', valueStart)) {
    const openIdx = (first === '[' || first === '{') ? valueStart : source.indexOf('(', valueStart);
    const openChar = source[openIdx];
    const closeChar = openChar === '[' ? ']' : openChar === '{' ? '}' : ')';
    let depth = 0;
    for (let i = openIdx; i < source.length; i += 1) {
      if (source[i] === openChar) depth += 1;
      else if (source[i] === closeChar) {
        depth -= 1;
        if (depth === 0) {
          end = source.indexOf(';', i) + 1;
          break;
        }
      }
    }
  } else if (first === "'" || first === '"') {
    let i = valueStart + 1;
    while (source[i] !== first) i += 1;
    end = source.indexOf(';', i) + 1;
  } else {
    throw new Error(`formato de const não suportado para ${name}`);
  }
  assert.ok(end > start, `${name} nunca fecha`);
  return source.slice(start, end);
}

const legacyIdentityExistsSrc = extractFunction('legacyIdentityExists');
const requestResetSrc = extractFunction('requestReset');
const resetPasswordSrc = extractFunction('resetPassword');
const loginSrc = extractFunction('login');

// --- Regra 1: nunca criar conta/profile moderno só por achar o e-mail na tabela
// legada - requestReset() só pode emitir o código, nunca escrever identidade. ------
assert.doesNotMatch(
  requestResetSrc,
  /INSERT INTO crewcheck_platform_accounts|INSERT INTO crewcheck_platform_profiles|ensureProfile\(/,
  'requestReset() nunca pode criar profile/account - a criação só pode acontecer em resetPassword(), após consumo válido do código',
);

// legacyIdentityExists() é puramente estrutural: nunca lê segredo, nunca retorna uma
// linha individual (só contagens/metadado de schema), e falha fechado (false) em
// ambiguidade ou erro - nunca lançando para dentro de requestReset()/resetPassword().
for (const forbidden of ['password_hash', 'password_salt']) {
  assert.doesNotMatch(legacyIdentityExistsSrc, new RegExp(forbidden, 'i'), `legacyIdentityExists() nunca pode referenciar "${forbidden}"`);
}
assert.doesNotMatch(
  legacyIdentityExistsSrc,
  /SELECT\s+(?!TABLE_NAME|COLUMN_NAME|COUNT)/i,
  'legacyIdentityExists() só pode retornar contagens ou metadado de schema, nunca uma linha individual do usuário legado',
);
assert.match(legacyIdentityExistsSrc, /catch\s*\{\s*return false;\s*\}/, 'qualquer erro (ex.: mismatch de collation) deve falhar fechado retornando false, nunca lançar');
assert.ok(legacyIdentityExistsSrc.includes('=== 1'), 'só exatamente uma linha legada correspondente pode habilitar a ponte - ambiguidade (>1) deve falhar fechado');

// Os dois gates de requestReset() devem dobrar a nova elegibilidade na MESMA
// condição que já governa a resposta genérica não-enumerável - nunca um novo formato
// de resposta que vazasse a diferença entre "não existe" e "existe mas é legado".
assert.ok(
  requestResetSrc.includes('const legacyBridgeEligible = !profiles[0] && !accounts[0] && !isAdminEmail(email) && await legacyIdentityExists(db, email);'),
  'gate inicial deve computar legacyBridgeEligible a partir do e-mail já normalizado (safeEmail)',
);
assert.ok(
  requestResetSrc.includes('if (!profiles[0] && !accounts[0] && !isAdminEmail(email) && !legacyBridgeEligible) return sendJson(res, 200, generic);'),
  'gate inicial deve continuar retornando a MESMA resposta genérica quando não elegível',
);
assert.ok(
  requestResetSrc.includes('if (!lockedProfiles[0] && !lockedAccounts[0] && !legacyBridgeEligible) {'),
  'gate transacional (sob FOR UPDATE) deve considerar legacyBridgeEligible antes de decidir emitir o código',
);

assert.ok(
  resetPasswordSrc.includes('const legacyBridgeEligible = !lockedProfiles[0] && !lockedAccounts[0] && await legacyIdentityExists(db, email);'),
  'gate de consumo deve computar legacyBridgeEligible sob o mesmo lock transacional dos profiles/accounts',
);
assert.ok(
  resetPasswordSrc.includes('if (!lockedProfiles[0] && !lockedAccounts[0] && !legacyBridgeEligible) {'),
  'código não pode ser consumido se não houver identidade atual NEM ponte legada elegível',
);

// --- Regra 3: só materializa o profile DEPOIS da verificação do código, e só cria a
// account DEPOIS do profile - ordem no texto prova a ordem de execução, já que é
// tudo sequencial dentro da mesma função/transação. ---------------------------------
const codeVerificationIndex = resetPasswordSrc.indexOf('secureCompare(reset.code_hash');
const profileMaterializationIndex = resetPasswordSrc.indexOf('ensureProfile(connection, email)');
const accountInsertIndex = resetPasswordSrc.indexOf('INSERT INTO crewcheck_platform_accounts');
const consumeIndex = resetPasswordSrc.indexOf('used_at=CURRENT_TIMESTAMP(3) WHERE email=? AND used_at IS NULL');
assert.ok(codeVerificationIndex >= 0, 'resetPassword() deve verificar o code_hash antes de qualquer escrita de identidade');
assert.ok(profileMaterializationIndex > codeVerificationIndex, 'ensureProfile() só pode ser chamado depois da verificação do código - nunca antes');
assert.ok(profileMaterializationIndex < accountInsertIndex, 'o profile deve existir antes do INSERT/UPSERT da account, para nunca duplicar identidade');
assert.ok(accountInsertIndex < consumeIndex, 'o código só pode ser marcado como consumido (used_at) depois que a conta já foi criada/atualizada com sucesso - tudo na mesma transação atômica');
assert.ok(
  resetPasswordSrc.includes('if (!lockedProfiles[0]) {\n      await ensureProfile(connection, email);\n    }'),
  'profile só deve ser materializado quando ainda não existir sob o mesmo lock - nunca duplicado',
);

// must_change_password=0 preservado - a senha definida na recuperação já é a senha
// definitiva, nunca um placeholder pendente de troca.
assert.ok(
  resetPasswordSrc.includes('ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash),password_salt=VALUES(password_salt),must_change_password=0'),
  'senha recuperada nunca pode deixar must_change_password pendente',
);

// Single-use / concorrência: o mecanismo já testado (PR #417) de FOR UPDATE +
// used_at IS NULL continua absolutamente intocado - a ponte só adiciona um gate de
// elegibilidade ANTES dele, nunca substitui ou enfraquece a trava transacional.
for (const lock of [
  "SELECT email FROM crewcheck_platform_profiles WHERE email=? LIMIT 1 FOR UPDATE",
  "SELECT email FROM crewcheck_platform_accounts WHERE email=? LIMIT 1 FOR UPDATE",
  'SELECT * FROM crewcheck_platform_password_resets WHERE email=? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE',
]) assert.ok(resetPasswordSrc.includes(lock), `trava transacional ausente em resetPassword(): ${lock}`);
assert.ok(
  resetPasswordSrc.includes("UPDATE crewcheck_platform_password_resets SET used_at=CURRENT_TIMESTAMP(3) WHERE email=? AND used_at IS NULL"),
  'consumo single-use (used_at) deve permanecer intocado - garante no máximo uma identidade final mesmo sob duas tentativas concorrentes',
);

// Ownership de roster preservado: a ponte não pode, em nenhuma circunstância,
// referenciar tabelas de roster (legado ou moderno) - preservado estruturalmente
// por nunca ser alcançável a partir deste código.
for (const [name, src] of [
  ['legacyIdentityExists', legacyIdentityExistsSrc],
  ['requestReset', requestResetSrc],
  ['resetPassword', resetPasswordSrc],
]) {
  assert.doesNotMatch(src, /crewcheck_rosters|crewcheck_platform_rosters/, `${name}() nunca pode tocar tabelas de roster - ownership é preservado por nunca ser alcançado`);
}

// login() não pode ganhar nenhuma lógica especial para a ponte legada - a conta
// recuperada deve se comportar exatamente como qualquer conta normal (must_change_
// password=0), permitindo dois logins consecutivos sem pedir nova troca de senha.
assert.doesNotMatch(
  loginSrc,
  /legacyIdentityExists|legacyBridgeEligible/,
  'login() não pode ter lógica especial para a ponte legada - deve tratar a identidade recuperada como qualquer conta normal',
);

// Nunca logar segredo/código/e-mail completo - mesma convenção já usada no restante
// do arquivo (console.info() de metadado é aceitável, console.log/warn/error com
// code/token/email não é).
for (const [name, src] of [
  ['requestReset', requestResetSrc],
  ['resetPassword', resetPasswordSrc],
  ['legacyIdentityExists', legacyIdentityExistsSrc],
]) {
  assert.doesNotMatch(src, /console\.(?:log|warn|error).*?(?:code|token|email)/i, `${name}() não pode logar segredo/código/e-mail`);
}
assert.doesNotMatch(resetPasswordSrc, /console\./, 'resetPassword() não deve logar nada');
assert.doesNotMatch(legacyIdentityExistsSrc, /console\./, 'legacyIdentityExists() não deve logar nada');

// --- Harness dinâmico isolado para legacyIdentityExists() --------------------------
// Esta função é autocontida (só depende do helper de collation já testado em #501),
// então - diferente de requestReset()/resetPassword(), que dependem de common.mjs e
// delivery.mjs e por isso são cobertas apenas estaticamente acima, seguindo a mesma
// convenção de regression-auth-profile-only-recovery.mjs e
// regression-p1-auth-reset-artifact-bridge.mjs - dá para exercitar de verdade.
const collationReportColumnsSrc = extractConst('LEGACY_COLLATION_REPORT_COLUMNS');
const defaultCollationSrc = extractConst('LEGACY_DEFAULT_COLLATION');
const collationReportFnSrc = extractFunction('legacyColumnCollationReport');
const resolveCollationSrc = extractFunction('resolveCommonCollation');
const collateEqSrc = extractFunction('collateEq');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-legacy-identity-bridge-'));
const tempFile = path.join(tempDir, 'legacy-identity-bridge.mjs');
try {
  const harness = `
${collationReportColumnsSrc}
${defaultCollationSrc}
${collationReportFnSrc}
${resolveCollationSrc}
${collateEqSrc}
${legacyIdentityExistsSrc}

export { legacyIdentityExists };

function collationMismatchError() {
  return Object.assign(new Error('Illegal mix of collations'), { code: 'ER_CANT_AGGREGATE_2COLLATIONS' });
}

export function makeDb({ legacyTableReady = true, legacyEmailColumnReady = true, collations = {}, variantCount = 0, throwOn = null } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (throwOn && sql.includes(throwOn)) throw collationMismatchError();
      if (sql.includes("TABLE_NAME='crewcheck_users' LIMIT 1")) {
        return [legacyTableReady ? [{ name: 'crewcheck_users' }] : []];
      }
      if (sql.includes("TABLE_NAME='crewcheck_users' AND COLUMN_NAME='email'")) {
        return [legacyEmailColumnReady ? [{ name: 'email' }] : []];
      }
      if (sql.includes('information_schema.columns') && sql.includes('COLUMN_NAME=?')) {
        const [table, column] = params;
        const found = collations[\`\${table}.\${column}\`];
        return [found ? [{ charset: found.charset, collation: found.collation }] : []];
      }
      if (sql.includes('variantCount')) {
        return [[{ variantCount }]];
      }
      throw new Error('Unexpected query in test harness: ' + sql);
    },
  };
}
`;
  fs.writeFileSync(tempFile, harness, 'utf8');
  const mod = await import(pathToFileURL(tempFile).href);

  const target = 'soraiasaraivam@gmail.com';
  const collations = {
    'crewcheck_users.id': { charset: 'utf8', collation: 'utf8_general_ci' },
    'crewcheck_users.email': { charset: 'utf8', collation: 'utf8_general_ci' },
  };

  // A) Tabela legada ausente: false, sem exceção.
  assert.equal(await mod.legacyIdentityExists(mod.makeDb({ legacyTableReady: false }), target), false, 'sem tabela crewcheck_users, nunca pode habilitar a ponte');

  // B) Coluna email ausente: false, sem exceção.
  assert.equal(await mod.legacyIdentityExists(mod.makeDb({ legacyEmailColumnReady: false }), target), false, 'sem coluna email, nunca pode habilitar a ponte');

  // C) Nenhuma linha legada corresponde: false - nada a recuperar.
  assert.equal(await mod.legacyIdentityExists(mod.makeDb({ collations, variantCount: 0 }), target), false, 'sem linha legada correspondente, a ponte não pode se habilitar');

  // D) Exatamente uma linha legada corresponde: true - único caso elegível.
  assert.equal(await mod.legacyIdentityExists(mod.makeDb({ collations, variantCount: 1 }), target), true, 'exatamente uma linha legada correspondente deve habilitar a ponte');

  // E) Duas ou mais linhas legadas normalizam para o mesmo e-mail: false -
  // ambiguidade nunca pode virar ponte automática, precisa de revisão humana (mesma
  // disciplina de legacyRecoveryCandidate/legacyRosterRecoveryPlan já estabelecida).
  assert.equal(await mod.legacyIdentityExists(mod.makeDb({ collations, variantCount: 2 }), target), false, 'ambiguidade (>1 linha legada) deve falhar fechado, nunca escolher uma silenciosamente');

  // F) Erro de collation (ou qualquer outra falha de query): false, nunca lança -
  // requestReset()/resetPassword() não podem virar 500 por causa desta checagem.
  assert.equal(await mod.legacyIdentityExists(mod.makeDb({ collations, throwOn: 'variantCount' }), target), false, 'falha de query deve degradar para false, nunca lançar para dentro do fluxo de reset');

  console.log('[p0-legacy-identity-bridge] OK — requestReset()/resetPassword() só materializam a identidade moderna após consumo válido e single-use do código; legacyIdentityExists() falha fechado em ambiguidade/erro; roster e ownership nunca são tocados; login() trata a conta recuperada como qualquer outra.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
