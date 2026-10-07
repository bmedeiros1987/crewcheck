export function newestImports<T extends { id: string; createdAt?: string; [key: string]: any }>(items: T[]): T[];
export function startupCanCommit(start: { owner: string; token: string | null; revision: number }, current: { owner: string; token: string | null; revision: number; cleared: boolean }): boolean;
export function pastRosterPeriod(roster: { year?: number; month?: number }, now?: Date): boolean;
