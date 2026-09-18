import { freshness, type TvSnapshot } from "./index";
export type DeviceCredential = {
  deviceId: string;
  token: string;
  expiresAt: string;
  privacy: "family" | "private";
};
export type TvStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const KEY = "crewcheck-tv-v1";
export class TvSession {
  credential: DeviceCredential | null = null;
  snapshot: TvSnapshot | null = null;
  constructor(
    private storage: TvStorage,
    private request: typeof fetch,
    private origin: string,
  ) {
    const url = new URL(origin);
    if (
      url.protocol !== "https:" &&
      url.hostname !== "localhost" &&
      url.hostname !== "127.0.0.1"
    )
      throw new Error("HTTPS required");
  }
  // Credential intentionally stays in memory until platform secure storage is
  // verified. Cold launch requires pairing; snapshot alone never restores access.
  pair(credential: DeviceCredential) {
    this.clear();
    if (
      !credential.deviceId ||
      !credential.token ||
      !Number.isFinite(Date.parse(credential.expiresAt)) ||
      !["family", "private"].includes(credential.privacy)
    )
      throw new Error("invalid_credential");
    this.credential = credential;
  }
  clear() {
    this.credential = null;
    this.snapshot = null;
    try {
      this.storage.removeItem(KEY);
    } catch {}
  }
  async call(path: string, body?: unknown) {
    // webOS TV 4.x uses Chromium 53, which predates AbortController.
    // Keep the same 8s lease with Promise.race and only attach a signal when
    // the platform actually provides AbortController.
    const Controller =
      typeof AbortController === "function" ? AbortController : null;
    const controller = Controller ? new Controller() : null;
    const init: RequestInit = {
      method: body === undefined ? "GET" : "POST",
      credentials: "omit",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(this.credential
          ? { Authorization: `Bearer ${this.credential.token}` }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
    if (controller) init.signal = controller.signal;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let response: Response;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          if (controller) controller.abort();
          reject(new Error("request_timeout"));
        }, 8000);
      });
      response = await Promise.race([
        this.request(`${this.origin}/api/tv/${path}`, init),
        timeout,
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (response.status === 401 || response.status === 403) {
      this.clear();
      throw new Error("pair_again");
    }
    if (!response.ok) throw new Error(`request_${response.status}`);
    return response.json();
  }
  async sync(now?: number) {
    const requestedAt = now ?? Date.now();
    const credential = this.credential;
    if (!credential || Date.parse(credential.expiresAt) <= requestedAt) {
      this.clear();
      throw new Error("pair_again");
    }
    const raw = await this.call("snapshot");
    // Ignore delayed responses from a prior pairing/logout.
    if (this.credential !== credential) throw new Error("session_changed");
    // The server generates a snapshot after the request began. Comparing it to
    // request-start time incorrectly marks a normal fresh response as future.
    // Production samples again AFTER receiving/parsing it; explicit test time
    // remains deterministic. Future observations still fail closed.
    const receivedAt = now ?? Date.now();
    if (Date.parse(credential.expiresAt) <= receivedAt) {
      this.clear();
      throw new Error("pair_again");
    }
    if (
      raw.schemaVersion !== 1 ||
      raw.deviceId !== credential.deviceId ||
      raw.privacy !== credential.privacy ||
      freshness(raw, receivedAt) === "unknown" ||
      !Array.isArray(raw.days) ||
      raw.days.length > 31 ||
      !raw.summary ||
      !Array.isArray(raw.changes) ||
      !Array.isArray(raw.ticker)
    ) {
      this.clear();
      throw new Error("invalid_snapshot");
    }
    this.snapshot = raw;
    // Shared televisions never persist private snapshots to unverified storage.
    if (raw.privacy === "family")
      try {
        this.storage.setItem(
          KEY,
          JSON.stringify({ deviceId: credential.deviceId, snapshot: raw }),
        );
      } catch {}
    return this.snapshot;
  }
  offline(now = Date.now()) {
    if (!this.credential || Date.parse(this.credential.expiresAt) <= now) {
      this.clear();
      return null;
    }
    // Offline leases cap exposure when remote revocation cannot be observed.
    if (
      !this.snapshot ||
      now - Date.parse(this.snapshot.generatedAt) > 900000
    ) {
      this.snapshot = null;
      try {
        this.storage.removeItem(KEY);
      } catch {}
      return null;
    }
    return this.snapshot;
  }
}
