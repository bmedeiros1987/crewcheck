export function stayEditorKey(accountId: string | null): string | null;
export function emptyStayEditor(accountId: string | null): any;
export function sanitizeStayChoice(value: any): any;
export function readStayEditor(storage: Pick<Storage, 'getItem'>, accountId: string | null): any;
export function writeStayEditor(storage: Pick<Storage, 'setItem'>, accountId: string | null, state: any): void;
export function migrateLegacyStay(saved: any, scope: any): any;
