import { cleanText, parseJsonColumn, readBody, requireIdentity, sendJson } from './common.mjs';

const ALLOWED_TIME = new Set(['automatico', 'manha', 'tarde', 'noite']);
const ALLOWED_PROVIDER = new Set(['wellhub', 'smartfit', 'ambos']);
const ALLOWED_ACTIVITIES = new Set(['academia', 'crossfit', 'pilates', 'corrida', 'caminhada', 'estudo', 'descanso']);

function normalizedPreferences(body = {}) {
  const activities = Array.isArray(body.activities)
    ? [...new Set(body.activities.map((item) => cleanText(item, 60).toLowerCase()).filter((item) => ALLOWED_ACTIVITIES.has(item)))].slice(0, 3)
    : [];
  return {
    activities,
    timePreference: ALLOWED_TIME.has(body.timePreference) ? body.timePreference : 'automatico',
    gymProvider: ALLOWED_PROVIDER.has(body.gymProvider) ? body.gymProvider : 'wellhub',
    minimumSleepHours: 8,
    updatedAt: new Date().toISOString(),
  };
}

export async function handleRoutineRoute(req, res, url) {
  if (url.pathname !== '/api/platform/routine/preferences') return false;
  const context = await requireIdentity(req, res);
  if (!context) return true;
  if (req.method === 'POST') {
    const body = await readBody(req, 300_000);
    const preferences = normalizedPreferences(body);
    await context.db.query(
      `INSERT INTO crewcheck_platform_routine_preferences (owner_email,activities,constraints)
       VALUES(?,?,?)
       ON DUPLICATE KEY UPDATE activities=VALUES(activities),constraints=VALUES(constraints),updated_at=CURRENT_TIMESTAMP(3)`,
      [
        context.email,
        JSON.stringify(preferences.activities),
        JSON.stringify({ timePreference: preferences.timePreference, gymProvider: preferences.gymProvider, minimumSleepHours: 8 }),
      ],
    );
  } else if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
    return true;
  }
  const [rows] = await context.db.query(
    'SELECT activities,constraints,updated_at FROM crewcheck_platform_routine_preferences WHERE owner_email=? LIMIT 1',
    [context.email],
  );
  const row = rows[0] || {};
  const constraints = parseJsonColumn(row.constraints, {}) || {};
  sendJson(res, 200, {
    ok: true,
    preferences: {
      activities: parseJsonColumn(row.activities, []) || [],
      timePreference: constraints.timePreference || 'automatico',
      gymProvider: constraints.gymProvider || 'wellhub',
      minimumSleepHours: 8,
      updatedAt: row.updated_at || null,
    },
  });
  return true;
}
