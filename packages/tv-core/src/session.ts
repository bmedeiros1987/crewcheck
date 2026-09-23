import { freshness, type TvSnapshot } from "./index";
import { invokeTvRequest } from "./nativeRequest";

export type DeviceCredential = {
  deviceId: string;
  token: string;
  expiresAt: string | null;
  privacy: "family" | "private";
  trusted?: boolean;
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
const TRUST_KEY = "crewcheck-tv-trusted-device-v1";

function validCredential(value: any): value is DeviceCredential {
  return Boolean(
    value &&
    typeof value.deviceId === "string" &&
    value.deviceId.length > 0 &&
    typeof value.token === "string" &&
    value.token.length > 0 &&
    (value.trusted === true || Number.isFinite(Date.parse(value.expiresAt))) &&
    ["family", "private"].includes(value.privacy),
  );
}
function validTrustedCredential(value: any): value is DeviceCredential {
  return validCredential(value) &&
    value.deviceId.length === 43 &&
    value.token.length === 43 &&
    value.trusted === true &&
    (value.expiresAt == null || Number.isFinite(Date.parse(value.expiresAt)));
}

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
  private lastServerNow: number | null = null;

  constructor(
    private storage: TvStorage,
    private request: typeof fetch,
    private origin: string,
    private persistentStorage: TvStorage | null = null,
  ) {
    const url = new URL(origin);
    if (
      url.protocol !== "https:" &&
      url.hostname !== "localhost" &&
      url.hostname !== "127.0.0.1"
    )
      throw new Error("HTTPS required");
    this.restoreTrusted();
  }

  restoreTrusted(): boolean {
    if (!this.persistentStorage) return false;
    try {
      const raw = this.persistentStorage.getItem(TRUST_KEY);
      if (!raw) return false;
      const value = JSON.parse(raw);
      if (!validTrustedCredential(value)) {
        this.persistentStorage.removeItem(TRUST_KEY);
        return false;
      }
      this.credential = value;
      return true;
    } catch {
      try { this.persistentStorage.removeItem(TRUST_KEY); } catch {}
      return false;
    }
  }

  private persistCredential() {
    if (!this.persistentStorage || !validTrustedCredential(this.credential)) return;
    try {
      this.persistentStorage.setItem(TRUST_KEY, JSON.stringify({
        deviceId: this.credential.deviceId,
        token: this.credential.token,
        expiresAt: this.credential.expiresAt,
        privacy: this.credential.privacy,
        trusted: true,
      }));
    } catch {}
  }

  pair(credential: DeviceCredential) {
    this.clear(true);
    if (!validCredential(credential)) throw new Error("invalid_credential");
    this.credential = { ...credential, trusted: credential.trusted === true };
    this.persistCredential();
  }

  renew(expiresAt: string | null) {
    if (!this.credential?.trusted) return;
    if (expiresAt != null && !Number.isFinite(Date.parse(expiresAt))) return;
    this.credential = { ...this.credential, expiresAt };
    this.persistCredential();
  }

  clear(forgetTrusted = true) {
    this.credential = null;
    this.snapshot = null;
    try { this.storage.removeItem(KEY); } catch {}
    if (forgetTrusted && this.persistentStorage) {
      try { this.persistentStorage.removeItem(TRUST_KEY); } catch {}
    }
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
    if (response.status === 401) {
      // A 401 means the device credential is no longer valid (for example,
      // explicit revocation). Only this condition is allowed to forget a
      // trusted TV automatically.
      this.clear(true);
      throw new Error("pair_again");
    }
    if (response.status === 403) {
      // Feature/account gates can be temporary. A trusted TV must remain
      // paired so service recovery never forces the owner through pairing
      // again. Temporary sessions keep the legacy fail-closed behaviour.
      if (this.credential?.trusted) throw new Error("access_forbidden");
      this.clear(true);
      throw new Error("pair_again");
    }
    if (!response.ok) throw new Error(`request_${response.status}`);
    const serverNow = Number(response.headers.get("X-CrewCheck-Server-Time"));
    this.lastServerNow =
      Number.isFinite(serverNow) && serverNow > 0 ? serverNow : null;
    return response.json();
  }

  async sync(now?: number) {
    const requestedAt = now ?? Date.now();
    const credential = this.credential;
    if (
      !credential ||
      (!credential.trusted && Date.parse(credential.expiresAt || "") <= requestedAt)
    ) {
      this.clear(true);
      throw new Error("pair_again");
    }

    const raw = await this.call("snapshot");
    if (this.credential !== credential) throw new Error("session_changed");

    const receivedAt = now ?? this.lastServerNow ?? Date.now();
    if (!credential.trusted && Date.parse(credential.expiresAt || "") <= receivedAt) {
      this.clear(true);
      throw new Error("pair_again");
    }

    const invalid = snapshotValidationCode(raw, credential, receivedAt);
    if (invalid) {
      this.snapshot = null;
      try { this.storage.removeItem(KEY); } catch {}
      // A malformed/stale projection must not unlink a trusted television.
      // Temporary sessions keep their previous fail-closed behaviour.
      if (!credential.trusted) this.clear(true);
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
    if (!this.credential) return null;
    const expiry = Date.parse(this.credential.expiresAt || "");
    if (!this.credential.trusted && (!Number.isFinite(expiry) || expiry <= now)) {
      this.clear(true);
      return null;
    }
    if (
      !this.snapshot ||
      now - Date.parse(this.snapshot.generatedAt) > 900000
    ) {
      this.snapshot = null;
      try { this.storage.removeItem(KEY); } catch {}
      return null;
    }
    return this.snapshot;
  }
}
