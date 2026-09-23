import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { createDeviceService } from "../server/tv/devices.mjs";
import { createTvHandler } from "../server/tv/routes.mjs";
import { createNewsGateway } from "../server/tv/news.mjs";
await mkdir("dist/tv-tests", { recursive: true });
await build({
  entryPoints: [
    "packages/tv-core/src/index.ts",
    "packages/tv-core/src/session.ts",
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  outdir: "dist/tv-tests",
  outExtension: { ".js": ".mjs" },
});
const { projectRoster, freshness, currentFact, remoteAction, monthDates } =
  await import("../dist/tv-tests/index.mjs");
const { TvSession } = await import("../dist/tv-tests/session.mjs");
let count = 0;
async function check(name, fn) {
  await fn();
  count++;
  console.log(`PASS ${name}`);
}
const now = Date.parse("2026-09-18T12:00:00Z");
const roster = {
  crewName: "PRIVATE NAME",
  crewId: "PRIVATE-ID",
  base: "BSB",
  rank: "CCM",
  month: 9,
  year: 2026,
  rawText: "SECRET PDF",
  days: [
    {
      date: "18/09/2026",
      dayOfWeek: "SEX",
      month: 9,
      year: 2026,
      type: "VOO",
      pairingCode: "",
      dutyReport: "16:25",
      dutyDebrief: "20:30",
      dutyHours: null,
      flyingHours: null,
      isNextDay: false,
      hotel: "SECRET HOTEL",
      base: "BSB",
      legs: [
        {
          flightNumber: "LA3301",
          origin: "BSB",
          destination: "GRU",
          departureTime: "17:20",
          arrivalTime: "19:30",
          workType: "OP",
          presentationTime: "16:25",
        },
      ],
    },
  ],
};
const opts = {
  deviceId: "device-a",
  snapshotId: "test",
  sourceVersion: "1",
  month: "2026-09",
  generatedAt: new Date(now).toISOString(),
  expiresAt: new Date(now + 60000).toISOString(),
  now: new Date(now),
};
await check(
  "family projection excludes names, raw PDF, hotel, flight and route",
  () => {
    const snapshot = projectRoster(roster, opts),
      json = JSON.stringify(snapshot);
    for (const secret of ["PRIVATE", "SECRET", "LA3301", "BSB", "GRU"])
      assert.ok(!json.includes(secret), secret);
    assert.equal(snapshot.next.presentation, "16:25");
    assert.equal(snapshot.days.length, 30);
  },
);
await check(
  "explicit visitor route projection reveals cities/codes but not flight number or ground metadata",
  () => {
    const s = projectRoster(roster, { ...opts, routeVisibility: "route" });
    const json = JSON.stringify(s);
    assert.equal(s.next.flight, null);
    assert.equal(s.next.origin, "BSB");
    assert.equal(s.next.destination, "GRU");
    assert.equal(s.next.groundBeforeMinutes, null);
    assert.ok(!json.includes("LA3301"));
    assert.ok(json.includes("BSB"));
    assert.ok(json.includes("GRU"));
  },
);
await check(
  "private projection keeps canonical IDs and APZ distinct from departure",
  () => {
    const s = projectRoster(roster, { ...opts, privacy: "private" });
    assert.equal(s.next.flight, "LA3301");
    assert.equal(s.next.presentation, "16:25");
    assert.ok(s.next.journeyId);
    assert.equal(s.days[17].activities[0].id, s.next.id);
  },
);
await check("missing published APZ never borrows STD", () => {
  const r = structuredClone(roster);
  r.days[0].dutyReport = null;
  delete r.days[0].legs[0].presentationTime;
  const s = projectRoster(r, opts);
  assert.equal(s.next.presentation, null);
});
await check("calendar leap year and invalid months", () => {
  assert.equal(monthDates("2028-02").length, 29);
  assert.throws(() => monthDates("2026-13"));
});
await check("freshness expires and rejects future observations", () => {
  assert.equal(freshness(opts, now + 60000), "stale");
  assert.equal(freshness(opts, now - 1), "unknown");
  assert.equal(
    currentFact(
      {
        value: "23",
        source: "radar",
        observedAt: opts.generatedAt,
        expiresAt: opts.expiresAt,
      },
      now + 60000,
    ),
    null,
  );
});
await check("platform back keys and D-pad", () => {
  for (const k of [10009, 461, 4, "Escape"])
    assert.equal(remoteAction(k), "back");
  assert.equal(remoteAction("ArrowRight"), "right");
  assert.equal(remoteAction("Power"), null);
});
let state = { pairings: {}, devices: {} },
  clock = now;
// Test-only atomic memory store; production must use persistent transactional storage.
const store = {
  async transaction(fn) {
    const copy = structuredClone(state);
    const result = fn(copy);
    state = copy;
    return result;
  },
};
const service = createDeviceService({
  store,
  now: () => clock,
  pairingOrigin: "https://crewcheck.online",
});
let credential;
await check(
  "pairing expires, polls slowly, approves once, never returns main token",
  async () => {
    const p = await service.begin("android-tv");
    assert.equal((await service.poll(p.deviceCode)).pending, true);
    await assert.rejects(() => service.poll(p.deviceCode), /slow_down/);
    await service.approve("account-a", p.userCode);
    await assert.rejects(
      () => service.approve("account-b", p.userCode),
      /invalid_pairing/,
    );
    clock += 5000;
    credential = await service.poll(p.deviceCode);
    assert.equal(
      (await service.authorize(credential.token)).userId,
      "account-a",
    );
    await assert.rejects(() => service.poll(p.deviceCode), /pairing_expired/);
    assert.ok(!JSON.stringify(state).includes(credential.token));
    const q = await service.begin("lg-webos");
    clock += 300001;
    await assert.rejects(() => service.poll(q.deviceCode), /pairing_expired/);
  },
);
await check(
  "cross-account revoke denied; revoke cuts sync and heartbeat",
  async () => {
    await assert.rejects(
      () => service.revoke("account-b", credential.deviceId),
      /device_not_found/,
    );
    await service.heartbeat(credential.token);
    await service.revoke("account-a", credential.deviceId);
    await assert.rejects(
      () => service.authorize(credential.token),
      /invalid_device/,
    );
    await assert.rejects(
      () => service.heartbeat(credential.token),
      /invalid_device/,
    );
  },
);
await check(
  "routes default off and authenticated account cannot be caller body",
  async () => {
    const deps = {
      devices: service,
      authenticateAccount: async () => null,
      loadProjection: async () => null,
      news: async () => ({ items: [] }),
      rateLimit: async () => true,
    };
    assert.equal(
      (await createTvHandler(deps)({ path: "/api/tv/pair", method: "POST" }))
        .status,
      404,
    );
    const result = await createTvHandler({ ...deps, enabled: true })({
      path: "/api/tv/approve",
      method: "POST",
      body: { userId: "account-a", userCode: "x" },
    });
    assert.equal(result.status, 401);
  },
);
await check("unauthorized response clears snapshot and storage", async () => {
  const values = new Map();
  const storage = {
    getItem: (k) => values.get(k),
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
  const client = new TvSession(
    storage,
    async () => new Response("{}", { status: 401 }),
    "https://crewcheck.online",
  );
  client.pair({
    ...credential,
    expiresAt: new Date(now + 86400000).toISOString(),
  });
  client.snapshot = projectRoster(roster, opts);
  await assert.rejects(() => client.sync(now));
  assert.equal(client.credential, null);
  assert.equal(client.snapshot, null);
  assert.equal(values.size, 0);
});
await check(
  "late response after logout cannot restore prior account",
  async () => {
    let resolve;
    const request = new Promise((r) => (resolve = r));
    const storage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    const client = new TvSession(
      storage,
      () => request,
      "https://crewcheck.online",
    );
    client.pair({
      ...credential,
      expiresAt: new Date(now + 86400000).toISOString(),
    });
    const sync = client.sync(now);
    client.clear();
    resolve(new Response(JSON.stringify(projectRoster(roster, opts))));
    await assert.rejects(() => sync, /session_changed/);
    assert.equal(client.snapshot, null);
  },
);
await check(
  "news isolates failed sources, deduplicates, limits stale retention",
  async () => {
    let tick = now,
      fail = false;
    const gateway = createNewsGateway({
      now: () => tick,
      sources: [
        {
          id: "official",
          url: "https://news.example/feed",
          hosts: ["news.example"],
        },
        {
          id: "failed",
          url: "https://failed.example/feed",
          hosts: ["failed.example"],
        },
      ],
      fetchItems: async (source) => {
        if (fail || source.id === "failed") throw new Error("offline");
        return [
          {
            title: "Aircraft update",
            url: "https://news.example/a?utm_source=test",
            publishedAt: new Date(now - 1000).toISOString(),
          },
          {
            title: "Aircraft update",
            url: "https://news.example/b",
            publishedAt: new Date(now - 1000).toISOString(),
          },
          {
            title: "Bad",
            url: "https://evil.example/a",
            publishedAt: new Date(now).toISOString(),
          },
        ];
      },
    });
    assert.equal((await gateway()).items.length, 1);
    fail = true;
    tick += 900001;
    assert.equal((await gateway()).stale, true);
    tick += 86400000;
    assert.equal((await gateway()).items.length, 0);
  },
);
await check(
  "two journeys on one civil day retain distinct canonical identity",
  () => {
    const r = structuredClone(roster);
    r.days[0].dutyReport = "08:00";
    r.days[0].dutyDebrief = "22:00";
    r.days[0].legs = [
      {
        flightNumber: "LA1001",
        origin: "BSB",
        destination: "GRU",
        departureTime: "09:00",
        arrivalTime: "10:30",
        presentationTime: "08:00",
        workType: "OP",
      },
      {
        flightNumber: "LA1002",
        origin: "GRU",
        destination: "BSB",
        departureTime: "19:00",
        arrivalTime: "20:30",
        presentationTime: "18:00",
        workType: "OP",
      },
    ];
    const s = projectRoster(r, { ...opts, privacy: "private" });
    const flights = s.days[17].activities.filter((a) => a.kind === "flight");
    assert.equal(flights.length, 2);
    assert.notEqual(flights[0].journeyId, flights[1].journeyId);
    assert.deepEqual(
      flights.map((a) => a.presentation),
      ["08:00", "18:00"],
    );
  },
);
await check("midnight keeps canonical end instant after start", () => {
  const r = structuredClone(roster);
  r.days[0].dutyReport = "22:00";
  r.days[0].dutyDebrief = "02:00";
  r.days[0].isNextDay = true;
  r.days[0].legs[0] = {
    ...r.days[0].legs[0],
    departureTime: "23:00",
    arrivalTime: "01:00",
    presentationTime: "22:00",
    isNextDay: true,
  };
  const s = projectRoster(r, opts);
  assert.ok(Date.parse(s.next.endAt) > Date.parse(s.next.startAt));
  assert.equal(s.days[17].activities[0].date, "2026-09-18");
});
await check("offline lease expires and clears stored snapshot", () => {
  const values = new Map();
  const storage = {
    getItem: (k) => values.get(k),
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
  const client = new TvSession(storage, fetch, "https://crewcheck.online");
  client.pair({
    ...credential,
    expiresAt: new Date(now + 86400000).toISOString(),
  });
  client.snapshot = projectRoster(roster, opts);
  values.set("crewcheck-tv-v1", "cached");
  assert.ok(client.offline(now + 899999));
  assert.equal(client.offline(now + 900001), null);
  assert.equal(values.size, 0);
});
await check("wrong device or privacy projection is rejected", async () => {
  const storage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
  const client = new TvSession(
    storage,
    async () => new Response(JSON.stringify(projectRoster(roster, opts))),
    "https://crewcheck.online",
  );
  client.pair({
    ...credential,
    expiresAt: new Date(now + 86400000).toISOString(),
  });
  await assert.rejects(() => client.sync(now), /invalid_snapshot/);
  assert.equal(client.credential, null);
});
await check(
  "API blocks caller-selected device projection and rate limit",
  async () => {
    const p = await service.begin("android-tv");
    await service.approve("account-a", p.userCode);
    const c = await service.poll(p.deviceCode);
    let authSeen;
    const handler = createTvHandler({
      enabled: true,
      devices: service,
      authenticateAccount: async () => null,
      rateLimit: async () => true,
      loadProjection: async (auth) => {
        authSeen = auth;
        return { deviceId: "wrong-device", privacy: "family" };
      },
    });
    const result = await handler({
      path: "/api/tv/snapshot",
      method: "GET",
      token: c.token,
      body: { userId: "account-b", deviceId: "wrong-device" },
    });
    assert.equal(authSeen.userId, "account-a");
    assert.equal(result.status, 503);
    const limited = createTvHandler({
      enabled: true,
      rateLimit: async () => false,
    });
    assert.equal(
      (await limited({ path: "/api/tv/pair", method: "POST" })).status,
      429,
    );
  },
);
console.log(`${count} TV behavioral tests passed`);
