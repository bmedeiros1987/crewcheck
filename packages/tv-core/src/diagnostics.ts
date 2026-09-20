// Diagnostico local da TV.
//
// Guarda apenas CODIGOS, nunca texto livre. Essa e a garantia estrutural de
// que nenhum token, chave ou URL com credencial acaba no armazenamento da TV:
// `record` normaliza para [A-Z0-9-] e corta em 32 caracteres, entao um segredo
// simplesmente nao cabe nem sobrevive a normalizacao.
//
// Nada aqui lanca. Se o armazenamento estiver indisponivel, o log vive so em
// memoria e o app segue.

export type DiagnosticEntry = { code: string; at: string };

const STORAGE_KEY = 'crewcheck-tv-diag-v1';
const MAX_ENTRIES = 20;
const MAX_CODE_LENGTH = 32;

/** Reduz qualquer entrada a um codigo seguro. Vazio vira 'UNKNOWN'. */
export function normalizeCode(raw: unknown): string {
  const code = String(raw == null ? '' : raw)
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_CODE_LENGTH);
  return code || 'UNKNOWN';
}

export type DiagnosticStorage = Pick<Storage, 'getItem' | 'setItem'>;

export class Diagnostics {
  private entries: DiagnosticEntry[] = [];

  constructor(private storage: DiagnosticStorage | null = null, private now: () => number = Date.now) {
    if (!storage) return;
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      this.entries = parsed
        .filter((entry) => entry && typeof entry.code === 'string' && typeof entry.at === 'string')
        .map((entry) => ({ code: normalizeCode(entry.code), at: entry.at }))
        .slice(-MAX_ENTRIES);
    } catch {
      this.entries = [];
    }
  }

  record(code: unknown): string {
    const normalized = normalizeCode(code);
    this.entries.push({ code: normalized, at: new Date(this.now()).toISOString() });
    if (this.entries.length > MAX_ENTRIES) this.entries = this.entries.slice(-MAX_ENTRIES);
    if (this.storage) {
      try {
        this.storage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
      } catch {
        // Armazenamento cheio ou bloqueado: o log de memoria basta.
      }
    }
    return normalized;
  }

  recent(count = MAX_ENTRIES): DiagnosticEntry[] {
    return this.entries.slice(-count);
  }

  lastCode(): string | null {
    return this.entries.length ? this.entries[this.entries.length - 1].code : null;
  }

  clear(): void {
    this.entries = [];
    if (this.storage) {
      try {
        this.storage.setItem(STORAGE_KEY, '[]');
      } catch { /* ignorado de proposito */ }
    }
  }
}

/** Constroi um Diagnostics mesmo quando o storage lanca ao ser tocado. */
export function createDiagnostics(candidate?: unknown): Diagnostics {
  try {
    const storage = candidate as DiagnosticStorage | undefined;
    if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') {
      return new Diagnostics(storage);
    }
  } catch { /* storage inacessivel */ }
  return new Diagnostics(null);
}
