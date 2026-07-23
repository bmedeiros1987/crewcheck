import fs from 'node:fs';

function update(path, transform) {
  if (!fs.existsSync(path)) throw new Error(`[v14313-hardening] Arquivo ausente: ${path}`);
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

update('client/src/lib/lifeConcierge.ts', (source) => {
  let next = source;

  const readPattern = /function readJson<T>\(key: string, fallback: T\): T \{[\s\S]*?\n\}/;
  if (!readPattern.test(next)) throw new Error('[v14313-hardening] readJson não encontrado.');
  next = next.replace(readPattern, `function readJson<T>(key: string, fallback: T): T {
  if (!storageAvailable()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (Array.isArray(fallback)) return (Array.isArray(parsed) ? parsed : fallback) as T;
    if (fallback && typeof fallback === 'object') return { ...(fallback as any), ...(parsed && typeof parsed === 'object' ? parsed : {}) } as T;
    return parsed as T;
  } catch {
    return fallback;
  }
}`);

  const snapshotPattern = /function currentSnapshot\(\): LifeHealthSnapshot \| null \{[\s\S]*?\n\}/;
  if (!snapshotPattern.test(next)) throw new Error('[v14313-hardening] currentSnapshot não encontrado.');
  next = next.replace(snapshotPattern, `function currentSnapshot(): LifeHealthSnapshot | null {
  const direct = parseHealthSnapshot(readJson<any>(KEYS.nativeSummary, null), 'health-connect');
  if (direct) return direct;
  const history = readJson<LifeHealthSnapshot[]>(KEYS.healthHistory, []);
  if (!Array.isArray(history)) return null;
  for (const item of history) {
    const parsed = parseHealthSnapshot(item, item.source || 'manual');
    if (parsed) return parsed;
  }
  return null;
}`);

  if (!next.includes('function isLifeQuietTime(')) {
    const anchor = 'export function scheduleLifeRemindersForToday(): number {';
    if (!next.includes(anchor)) throw new Error('[v14313-hardening] Agenda de lembretes não encontrada.');
    const helper = `function minutesOfDay(value: string): number {
  const [hour, minute] = String(value || '').split(':').map(Number);
  return clamp((Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0), 0, 1439);
}

function isLifeQuietTime(date: Date, preferences: LifeAdaptivePreferences): boolean {
  const current = date.getHours() * 60 + date.getMinutes();
  const start = minutesOfDay(preferences.quietStart);
  const end = minutesOfDay(preferences.quietEnd);
  return start <= end ? current >= start && current < end : current >= start || current < end;
}

`;
    next = next.replace(anchor, `${helper}${anchor}`);
  }

  next = next.replace(
    "    if (item.time.getTime() <= now.getTime() + 60_000) return;",
    "    if (item.time.getTime() <= now.getTime() + 60_000 || isLifeQuietTime(item.time, preferences)) return;",
  );

  if (!next.includes('if (Array.isArray(fallback))') || !next.includes('isLifeQuietTime(item.time, preferences)')) {
    throw new Error('[v14313-hardening] Armazenamento ou silêncio dos lembretes não foi endurecido.');
  }
  return next;
});

update('client/src/components/v14313/LifeConciergePanel.tsx', (source) => {
  const duplicated = `    recordGymCheckIn(name, preferences.shareGymCheckins);
    recordLifeEvent({ type: 'exercise', status: 'completed', source: 'gym-checkin', durationMinutes: 0, note: \`Check-in em \${name}\` });`;
  const next = source.includes(duplicated)
    ? source.replace(duplicated, `    recordGymCheckIn(name, preferences.shareGymCheckins);`)
    : source;
  if (next.includes("recordLifeEvent({ type: 'exercise', status: 'completed', source: 'gym-checkin'")) {
    throw new Error('[v14313-hardening] Check-in ainda está sendo contado duas vezes.');
  }
  return next;
});

console.log('[v14313-hardening] Arrays preservados, snapshot tipado, silêncio respeitado e check-in sem duplicidade.');
