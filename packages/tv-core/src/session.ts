import {freshness, type TvSnapshot} from './index';
import {bindFetch, classifyOrigin} from './net';
export type DeviceCredential = {deviceId:string; token:string; expiresAt:string; privacy:'family'|'private'};
export type TvStorage = Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const KEY = 'crewcheck-tv-v1';
export class TvSession {
  credential: DeviceCredential | null = null;
  private request: typeof fetch;
  snapshot: TvSnapshot | null = null;
  /**
   * Motivo quando a origem configurada nao serve. Fica guardado em vez de
   * virar excecao: este construtor roda em escopo de modulo, antes do React
   * montar, e lancar aqui apaga a tela sem nenhuma mensagem. O app le isto e
   * mostra a Home minima com o diagnostico.
   */
  readonly configError: string | null = null;
  constructor(private storage: TvStorage, request: typeof fetch, private origin: string) {
    // bindFetch: sem isto, `this.request(...)` lanca Illegal invocation no
    // navegador e toda chamada de API falha silenciosamente.
    this.request = bindFetch(request);
    const verdict = classifyOrigin(origin);
    if (verdict.kind === 'rejected') this.configError = verdict.reason;
    else this.origin = verdict.origin;
  }
  // Credential intentionally stays in memory until platform secure storage is
  // verified. Cold launch requires pairing; snapshot alone never restores access.
  pair(credential: DeviceCredential) { this.clear(); this.credential = credential; }
  clear() { this.credential = null; this.snapshot = null; try {this.storage.removeItem(KEY);} catch {} }
  async call(path:string, body?:unknown) {
    if (this.configError) throw new Error('config_error');
    const response = await this.request(`${this.origin}/api/tv/${path}`, {
      method:body === undefined ? 'GET':'POST', credentials:'omit', cache:'no-store',
      headers:{'Content-Type':'application/json', ...(this.credential ? {Authorization:`Bearer ${this.credential.token}`} : {})},
      ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal:AbortSignal.timeout(8000),
    });
    if (response.status === 401 || response.status === 403) {this.clear(); throw new Error('pair_again');}
    if (!response.ok) throw new Error(`request_${response.status}`);
    return response.json();
  }
  async sync(now = Date.now()) {
    const credential = this.credential;
    if (!credential || Date.parse(credential.expiresAt) <= now) {this.clear(); throw new Error('pair_again');}
    const raw = await this.call('snapshot');
    // Ignore delayed responses from a prior pairing/logout.
    if (this.credential !== credential) throw new Error('session_changed');
    if (raw.schemaVersion !== 1 || raw.deviceId !== credential.deviceId || raw.privacy !== credential.privacy ||
      freshness(raw, now) === 'unknown' || !Array.isArray(raw.days) || raw.days.length > 31 || !raw.summary ||
      !Array.isArray(raw.changes) || !Array.isArray(raw.ticker)) {this.clear(); throw new Error('invalid_snapshot');}
    this.snapshot = raw;
    // Shared televisions never persist private snapshots to unverified storage.
    if (raw.privacy === 'family') try {this.storage.setItem(KEY, JSON.stringify({deviceId:credential.deviceId,snapshot:raw}));} catch {}
    return this.snapshot;
  }
  offline(now = Date.now()) {
    if (!this.credential || Date.parse(this.credential.expiresAt) <= now) {this.clear(); return null;}
    // Offline leases cap exposure when remote revocation cannot be observed.
    if (!this.snapshot || now-Date.parse(this.snapshot.generatedAt) > 900000) {this.snapshot=null; return null;}
    return this.snapshot;
  }
}
