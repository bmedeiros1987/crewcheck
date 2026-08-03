import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncLinkedTelegramRoster } from '../server/platform.mjs';

const server = fs.readFileSync('server.mjs', 'utf8');
const platform = fs.readFileSync('server/platform.mjs', 'utf8');
const chain = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');

assert.match(server, /syncLinkedTelegramRoster/, 'Telegram deve importar o sincronizador canônico da plataforma');
assert.match(server, /profile\.linked\s*\?\s*await syncLinkedTelegramRoster/, 'somente conta Telegram vinculada pode tentar ativar roster no banco principal');
assert.match(server, /Web, PWA e aplicativo receberam a mesma revisão ativa desta escala/, 'resposta Telegram deve confirmar paridade apenas após sync verde');
assert.match(server, /A sincronização com sua conta CrewCheck não foi confirmada/, 'falha de persistência precisa ser visível e segura');
assert.match(platform, /export async function syncLinkedTelegramRoster/, 'plataforma deve expor helper interno de sync vinculado');
assert.match(platform, /const ownerEmail = safeEmail\(input\.email\)/, 'helper deve exigir e-mail CrewCheck válido');
assert.match(platform, /SELECT \* FROM crewcheck_platform_profiles WHERE email=\$1 LIMIT 1/, 'helper deve provar que a conta vinculada existe');
assert.match(platform, /const synced = await syncRosterForContext/, 'Telegram e API precisam reutilizar o mesmo preparo de roster');
assert.match(platform, /saveRosterMysql\(context/, 'sync compartilhado precisa chegar à transação canônica protegida pela #279');
assert.match(chain, /await import\('\.\.\/v14376\/apply\.mjs'\);/, 'slice v14.3.76 deve rodar no preparo canônico');

function createFakeDatabase({ email = 'pilot@example.test' } = {}) {
  const state = {
    profiles: new Map([[email, { email, public_id: 'CC-TEST', display_name: 'Tripulante Teste', locale: 'pt-BR', timezone: 'America/Sao_Paulo', plan: 'free', share_presence: false }]]),
    rosters: [],
    writeCount: 0,
    forceInvariantFailure: false,
  };

  const query = async (sql, params = []) => {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    if (/^BEGIN$|^COMMIT$|^ROLLBACK$/.test(normalized)) return { rows: [], rowCount: 0 };
    if (/SELECT \* FROM crewcheck_platform_profiles WHERE email=\$1 LIMIT 1/.test(normalized)) {
      const row = state.profiles.get(params[0]);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (/SELECT email FROM crewcheck_platform_profiles WHERE email=\$1 FOR UPDATE/.test(normalized)) {
      const row = state.profiles.get(params[0]);
      return { rows: row ? [{ email: row.email }] : [], rowCount: row ? 1 : 0 };
    }
    if (/UPDATE crewcheck_platform_rosters SET active=FALSE WHERE owner_email=\$1/.test(normalized)) {
      state.writeCount += 1;
      for (const row of state.rosters) if (row.owner_email === params[0]) row.active = false;
      return { rows: [], rowCount: 1 };
    }
    if (/INSERT INTO crewcheck_platform_rosters/.test(normalized)) {
      state.writeCount += 1;
      const [id, ownerEmail, key, rosterJson, complianceJson, gymJson, sourceName, fingerprint] = params;
      let row = state.rosters.find((item) => item.owner_email === ownerEmail && item.roster_key === key);
      const values = {
        id,
        owner_email: ownerEmail,
        roster_key: key,
        roster: JSON.parse(rosterJson),
        compliance: JSON.parse(complianceJson),
        gym: JSON.parse(gymJson),
        source_name: sourceName,
        fingerprint,
        active: true,
        created_at: '2026-08-03 05:30:00.000',
        updated_at: '2026-08-03 05:30:00.000',
      };
      if (row) Object.assign(row, values, { id: row.id });
      else { row = values; state.rosters.push(row); }
      return { rows: [], rowCount: 1 };
    }
    if (/SELECT id,stay_date,hotel_key FROM crewcheck_platform_stays/.test(normalized)) return { rows: [], rowCount: 0 };
    if (/SELECT id,roster_key,updated_at FROM crewcheck_platform_rosters WHERE owner_email=\$1 AND roster_key=\$2 LIMIT 1/.test(normalized)) {
      const row = state.rosters.find((item) => item.owner_email === params[0] && item.roster_key === params[1]);
      return { rows: row ? [{ id: row.id, roster_key: row.roster_key, updated_at: row.updated_at }] : [], rowCount: row ? 1 : 0 };
    }
    if (/SELECT \* FROM crewcheck_platform_rosters WHERE owner_email=\$1 AND roster_key=\$2 LIMIT 1/.test(normalized)) {
      const row = state.rosters.find((item) => item.owner_email === params[0] && item.roster_key === params[1]);
      return { rows: row ? [structuredClone(row)] : [], rowCount: row ? 1 : 0 };
    }
    if (/SELECT roster_key,fingerprint FROM crewcheck_platform_rosters WHERE owner_email=\$1 AND active=TRUE/.test(normalized)) {
      if (state.forceInvariantFailure) return { rows: [], rowCount: 0 };
      const rows = state.rosters.filter((item) => item.owner_email === params[0] && item.active).slice(0, 2).map((row) => ({ roster_key: row.roster_key, fingerprint: row.fingerprint }));
      return { rows, rowCount: rows.length };
    }
    throw new Error(`[fake-db] SQL não previsto: ${normalized}`);
  };

  const db = {
    query,
    async connect() { return { query, release() {} }; },
  };
  return { db, state };
}

const roster = {
  crewName: 'Tripulante Teste',
  crewId: '00000000',
  base: 'BSB',
  month: 8,
  year: 2026,
  days: [
    {
      date: '01/08/2026',
      type: 'VOO',
      dutyReport: '13:05',
      dutyDebrief: '21:50',
      legs: [
        { flightNumber: 'LA3558', origin: 'FOR', destination: 'PHB', departureTime: '13:35', arrivalTime: '14:37' },
        { flightNumber: 'LA3559', origin: 'PHB', destination: 'FOR', departureTime: '15:58', arrivalTime: '16:52' },
        { flightNumber: 'LA4631', origin: 'FOR', destination: 'CGH', departureTime: '17:39', arrivalTime: '21:09' },
      ],
    },
  ],
};

{
  const { db, state } = createFakeDatabase();
  const result = await syncLinkedTelegramRoster({ email: 'pilot@example.test', roster, sourceName: 'escala-agosto.pdf' }, { db });
  assert.equal(result.ok, true, `conta vinculada deve sincronizar: ${JSON.stringify(result)}`);
  assert.equal(result.databasePrimary, true);
  assert.equal(state.rosters.filter((row) => row.active).length, 1, 'deve existir exatamente uma escala ativa após sync Telegram');
  const active = state.rosters.find((row) => row.active);
  assert.deepEqual(active.roster.days[0].legs.map((leg) => `${leg.flightNumber}:${leg.origin}-${leg.destination}`), [
    'LA3558:FOR-PHB', 'LA3559:PHB-FOR', 'LA4631:FOR-CGH',
  ]);
  assert.equal(result.roster.checksum, active.fingerprint, 'identidade retornada deve usar o fingerprint salvo');
}

{
  const { db, state } = createFakeDatabase();
  const before = state.writeCount;
  const result = await syncLinkedTelegramRoster({ email: 'telegram:123456', roster, sourceName: 'escala.pdf' }, { db });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'LINKED_EMAIL_REQUIRED');
  assert.equal(state.writeCount, before, 'identidade Telegram não vinculada nunca pode escrever roster de plataforma');
}

{
  const { db, state } = createFakeDatabase();
  const result = await syncLinkedTelegramRoster({ email: 'missing@example.test', roster, sourceName: 'escala.pdf' }, { db });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'LINKED_PROFILE_NOT_FOUND');
  assert.equal(state.writeCount, 0, 'e-mail sem perfil CrewCheck não pode escrever roster');
}

{
  const { db, state } = createFakeDatabase();
  state.forceInvariantFailure = true;
  const result = await syncLinkedTelegramRoster({ email: 'pilot@example.test', roster, sourceName: 'escala.pdf' }, { db });
  assert.equal(result.ok, false, 'falha da invariante #279 precisa falhar fechada');
  assert.equal(result.code, 'ACTIVE_ROSTER_INVARIANT');
  assert.equal(result.retryable, true);
}

console.log('[v14.3.76] OK — Telegram vinculado ativa a mesma escala canônica; não vinculado não escreve; invariante falha fechada.');
