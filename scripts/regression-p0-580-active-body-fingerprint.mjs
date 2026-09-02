import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { freezeFixtureClock } from './p0-580-transposed-vc-boundary/fixed-clock.mjs';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-580-active-body-fingerprint-'));
class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
}
const flightDay = (flightNumber) => ({
  date: '31/08/2026', type: 'FLIGHT', pairingCode: flightNumber, dutyReport: '07:00',
  legs: [{ flightNumber, origin: 'BSB', destination: 'CCC', departureTime: '08:00' }],
});
const roster = (flightNumber) => ({
  crewId: 'CREW-A', crewName: 'Tripulante Alpha', base: 'BSB', rank: 'CCM', airline: 'LATAM',
  year: 2026, month: 8, rawText: '', days: [flightDay(flightNumber)],
});

try {
  await build({
    configFile: false,
    logLevel: 'silent',
    resolve: { alias: { '@shared': path.resolve('shared') } },
    build: {
      lib: { entry: path.resolve('client/src/lib/databaseClient.ts'), formats: ['es'], fileName: () => 'database-client.mjs' },
      outDir, emptyOutDir: true, minify: false,
    },
  });

  const restoreClock = freezeFixtureClock();
  try {
    globalThis.localStorage = new MemoryStorage();
    globalThis.sessionStorage = new MemoryStorage();
    globalThis.window = { location: { origin: 'https://crewcheck.test' }, dispatchEvent() {} };
    localStorage.setItem('crewcheck_auth_token', 'test-token');
    localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'crew-580', email: 'crew@example.test' }));

    const trusted = roster('LA1000');
    localStorage.setItem('crewcheck_local_history_v11_crew-580', JSON.stringify([{
      id: 'local-august-trusted', checksum: 'trusted', createdAt: '2026-08-31T12:00:00.000Z',
      sourceFileName: 'august-trusted.pdf', roster: trusted, compliance: { score: 100, alerts: [] }, gym: [],
    }]));

    const { openActiveRoster } = await import(`${pathToFileURL(path.join(outDir, 'database-client.mjs')).href}?v=${Date.now()}`);

    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url === '/api/rosters/active') {
        return new Response(JSON.stringify({
          ok: true,
          roster: { id: 'remote-august', checksum: 'trusted', year: 2026, month: 8, crewId: 'CREW-A', crewName: 'Tripulante Alpha', isActive: true },
          data: { roster: roster('LA9999'), compliance: { score: 100, alerts: [] }, gym: [] },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404, headers: { 'content-type': 'application/json' } });
    };

    await assert.rejects(
      () => openActiveRoster(),
      (error) => {
        assert.equal(error?.code, 'ACTIVE_ROSTER_BODY_MISMATCH');
        return true;
      },
      'mesma competência/checksum nunca pode autorizar corpo operacional diferente',
    );

    const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    try {
      Object.defineProperty(globalThis, 'crypto', { configurable: true, writable: true, value: undefined });
      globalThis.fetch = async (input) => {
        const url = String(input);
        if (url === '/api/rosters/active') {
          return new Response(JSON.stringify({
            ok: true,
            roster: { id: 'remote-august-sha', checksum: '0'.repeat(64), year: 2026, month: 8, crewId: 'CREW-A', crewName: 'Tripulante Alpha', isActive: true },
            data: { roster: roster('LA9999'), compliance: { score: 100, alerts: [] }, gym: [] },
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response(JSON.stringify({ ok: false }), { status: 404, headers: { 'content-type': 'application/json' } });
      };

      await assert.rejects(
        () => openActiveRoster(),
        (error) => {
          assert.equal(error?.code, 'ACTIVE_ROSTER_BODY_MISMATCH');
          return true;
        },
        'checksum SHA-256 anunciado deve falhar fechado quando Web Crypto estiver indisponível',
      );
    } finally {
      if (cryptoDescriptor) Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
      else delete globalThis.crypto;
    }

    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url === '/api/rosters/active') {
        return new Response(JSON.stringify({
          ok: true,
          roster: { id: 'remote-august', checksum: 'trusted', year: 2026, month: 8, crewId: 'CREW-A', crewName: 'Tripulante Alpha', isActive: true },
          data: { roster: trusted, compliance: { score: 100, alerts: [] }, gym: [] },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404, headers: { 'content-type': 'application/json' } });
    };
    const accepted = await openActiveRoster();
    assert.ok(accepted.roster.days.some((day) => day.pairingCode === 'LA1000'), 'corpo que coincide com snapshot autorizado deve permanecer aceito');
    assert.ok(!accepted.roster.days.some((day) => day.pairingCode === 'LA9999'), 'corpo trocado não pode sobreviver ao controle positivo');

    const source = fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8');
    assert.match(source, /P0_580_ACTIVE_BODY_FINGERPRINT_GUARD/);
    assert.match(source, /await assertActiveRosterBodyIdentity\(payload\.roster \|\| null, payload\.data\.roster, local \|\| null\);/);
    assert.match(source, /ACTIVE_ROSTER_BODY_MISMATCH/);
    assert.match(source, /if \(!globalThis\.crypto\?\.subtle\)/);
    assert.match(source, /if \(bodyFingerprint !== announced\)/);

    console.log('[p0-580-active-body-fingerprint] PASS');
  } finally {
    restoreClock();
  }
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
