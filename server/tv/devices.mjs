import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

const hash = (value) =>
  createHash("sha256").update(String(value)).digest("hex");
const secret = () => randomBytes(32).toString("base64url");
const equal = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export class TvError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
  }
}
// store.transaction must provide atomic read-modify-write, including across
// processes. The production database adapter is a mandatory composition seam.
export function createDeviceService({ store, now = Date.now, pairingOrigin }) {
  if (new URL(pairingOrigin).protocol !== "https:")
    throw new Error("HTTPS pairing origin required");
  return {
    async begin(platform) {
      if (!["android-tv", "samsung-tizen", "lg-webos"].includes(platform))
        throw new TvError(400, "invalid_platform");
      const deviceCode = secret(),
        userCode = randomBytes(5).toString("hex").toUpperCase();
      await store.transaction((state) => {
        state.pairings ??= {};
        state.devices ??= {};
        for (const [key, p] of Object.entries(state.pairings))
          if (p.expiresAt <= now()) delete state.pairings[key];
        if (Object.keys(state.pairings).length >= 1000)
          throw new TvError(429, "pairing_capacity");
        state.pairings[hash(deviceCode)] = {
          userCode,
          platform,
          expiresAt: now() + 300000,
          lastPoll: 0,
        };
      });
      return {
        deviceCode,
        userCode,
        expiresIn: 300,
        interval: 5,
        verificationUri: `${pairingOrigin}/tv-pair?code=${userCode}`,
      };
    },
    async approve(userId, userCode, privacy = "family") {
      if (!userId) throw new TvError(401, "authentication_required");
      if (!["family", "private"].includes(privacy))
        throw new TvError(400, "invalid_privacy");
      return store.transaction((state) => {
        const p = Object.values(state.pairings ?? {}).find((p) =>
          equal(p.userCode, userCode),
        );
        if (!p || p.expiresAt <= now() || p.userId)
          throw new TvError(400, "invalid_pairing");
        p.userId = userId;
        p.privacy = privacy;
        return { ok: true };
      });
    },
    async poll(deviceCode) {
      return store.transaction((state) => {
        const key = hash(deviceCode),
          p = state.pairings?.[key];
        if (!p || p.expiresAt <= now())
          throw new TvError(410, "pairing_expired");
        if (p.lastPoll && now() - p.lastPoll < 5000)
          throw new TvError(429, "slow_down");
        p.lastPoll = now();
        if (!p.userId) return { pending: true };
        for (const [id, d] of Object.entries(state.devices))
          if (d.expiresAt <= now()) delete state.devices[id];
        if (Object.keys(state.devices).length >= 1000)
          throw new TvError(429, "device_capacity");
        const token = secret(),
          deviceId = secret();
        state.devices[deviceId] = {
          deviceId,
          userId: p.userId,
          privacy: p.privacy,
          platform: p.platform,
          tokenHash: hash(token),
          expiresAt: now() + 86400000,
          lastSeenAt: now(),
          scopes: ["tv:read"],
          revoked: false,
        };
        delete state.pairings[key];
        return {
          deviceId,
          token,
          expiresAt: new Date(now() + 86400000).toISOString(),
          privacy: p.privacy,
        };
      });
    },
    async authorize(token) {
      if (typeof token !== "string" || token.length < 40)
        throw new TvError(401, "invalid_device");
      return store.transaction((state) => {
        const d = Object.values(state.devices ?? {}).find((d) =>
          equal(d.tokenHash, hash(token)),
        );
        if (
          !d ||
          d.revoked ||
          d.expiresAt <= now() ||
          !d.scopes.includes("tv:read")
        )
          throw new TvError(401, "invalid_device");
        return {
          deviceId: d.deviceId,
          userId: d.userId,
          privacy: d.privacy,
          platform: d.platform,
        };
      });
    },
    async heartbeat(token) {
      const auth = await this.authorize(token);
      return store.transaction((state) => {
        const d = state.devices[auth.deviceId];
        if (d.revoked || d.expiresAt <= now())
          throw new TvError(401, "invalid_device");
        d.lastSeenAt = now();
        return { ok: true };
      });
    },
    async revoke(userId, deviceId) {
      return store.transaction((state) => {
        const d = state.devices?.[deviceId];
        if (!userId || !d || d.userId !== userId)
          throw new TvError(404, "device_not_found");
        d.revoked = true;
        d.tokenHash = "";
        return { ok: true };
      });
    },
    async list(userId) {
      if (!userId) throw new TvError(401, "authentication_required");
      return store.transaction((state) =>
        Object.values(state.devices ?? {})
          .filter((d) => d.userId === userId)
          .map((d) => ({
            deviceId: d.deviceId,
            platform: d.platform,
            privacy: d.privacy,
            lastSeenAt: d.lastSeenAt,
            revoked: d.revoked,
          })),
      );
    },
  };
}
