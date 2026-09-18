import { freshness, type TvSnapshot } from "./index";
import { invokeTvRequest } from "./nativeRequest";

export type DeviceCredential = {
  deviceId: string;
  token: string;
  expiresAt: string;
  privacy: "family" | "private";
};
export type TvStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type SnapshotValidationCode =
  | "schema"
  | "device"
  | "privacy"
  | "time"
  | "days_type"
  | "days_count"
  | "summary"
  | "changes"
  | "ticker";

const KEY = "crewcheck-tv-v1";

export function snapshotValidationCode(
  raw: any,
  credential: DeviceCredential,
  receivedAt: number,
): SnapshotValidationCode | null {
  if (raw?.schemaVersion !== 1) return "schema";
  if (raw?.deviceId !== credential.deviceId) return "device";
  if (raw?.privacy !== credential.privacy) return "privacy";
  if (freshness(raw, receivedAt) === "unknown") return "time";
  if (!Array.isArray(raw?.days)) return "days_type";
  if (raw.days.length > 31) return "days_count";
  if (!raw?.summary || typeof raw.summary !== "object") return "summary";
  if (!Array.isArray(raw?.changes)) return "changes";
  if (!Array.isArray(raw?.ticker)) return "ticker";
  return null;
}

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
        invokeTvRequest(this.request, `${this.origin}/api/tv/${path}`, init),
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
    if (this.credential !== credential) throw new Error("session_changed");

    const receivedAt = now ?? Date.now();
    if (Date.parse(credential.expiresAt) <= receivedAt) {
      this.clear();
      throw new Error("pair_again");
    }

    const invalid = snapshotValidationCode(raw, credential, receivedAt);
    if (invalid) {
      this.clear();
      throw new Error(`invalid_snapshot_${invalid}`);
    }

    this.snapshot = raw;
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
