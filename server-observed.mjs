import http from 'node:http';
import crypto from 'node:crypto';

const originalCreateServer = http.createServer.bind(http);
const startedAt = Date.now();
const counters = {
  requests: 0,
  errors5xx: 0,
  inFlight: 0,
  peakInFlight: 0,
  totalDurationMs: 0,
};

function requestId(req) {
  const incoming = String(req.headers['x-request-id'] || '').trim();
  return /^[A-Za-z0-9._:-]{8,120}$/.test(incoming) ? incoming : crypto.randomUUID();
}

function memorySnapshot() {
  const value = process.memoryUsage();
  return {
    rssMb: Math.round(value.rss / 1024 / 1024),
    heapUsedMb: Math.round(value.heapUsed / 1024 / 1024),
    heapTotalMb: Math.round(value.heapTotal / 1024 / 1024),
    externalMb: Math.round(value.external / 1024 / 1024),
  };
}

function publicRuntime() {
  const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);
  return {
    service: 'crewcheck',
    environment: String(process.env.CREWCHECK_ENV || process.env.NODE_ENV || 'development'),
    version: String(process.env.CREWCHECK_VERSION || process.env.RENDER_GIT_COMMIT || 'unknown').slice(0, 80),
    uptimeSeconds,
    memory: memorySnapshot(),
    traffic: {
      requests: counters.requests,
      inFlight: counters.inFlight,
      peakInFlight: counters.peakInFlight,
      errors5xx: counters.errors5xx,
      averageDurationMs: counters.requests ? Math.round(counters.totalDurationMs / counters.requests) : 0,
    },
  };
}

function sendJson(res, statusCode, payload) {
  if (res.writableEnded) return;
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}

async function dependencySnapshot() {
  const databaseUrl = String(process.env.DATABASE_URL || process.env.CREWCHECK_DATABASE_URL || process.env.MYSQL_URL || '').trim();
  const dependencies = {
    database: { configured: Boolean(databaseUrl), ok: null },
    telegram: { configured: Boolean(process.env.TELEGRAM_BOT_TOKEN || process.env.CREWCHECK_TELEGRAM_BOT_TOKEN), ok: null },
    radar: {
      configured: Boolean(
        process.env.FLIGHTAWARE_AEROAPI_KEY ||
        process.env.AEROAPI_KEY ||
        process.env.AVIATIONSTACK_API_KEY ||
        process.env.AIRLABS_API_KEY ||
        process.env.AERODATABOX_API_KEY ||
        process.env.CREWCHECK_FLIGHT_STATUS_URL
      ),
      ok: null,
    },
  };

  if (/^mysql:\/\//i.test(databaseUrl)) {
    try {
      const mysql = await import('mysql2/promise');
      const parsed = new URL(databaseUrl);
      const connection = await mysql.createConnection({
        host: parsed.hostname,
        port: Number(parsed.port || 3306),
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        database: parsed.pathname.replace(/^\//, ''),
        connectTimeout: 2500,
        ssl: { rejectUnauthorized: false },
      });
      await connection.query('SELECT 1');
      await connection.end();
      dependencies.database.ok = true;
    } catch {
      dependencies.database.ok = false;
    }
  }

  const configuredCritical = Object.values(dependencies).filter((item) => item.configured);
  const failedCritical = configuredCritical.filter((item) => item.ok === false);
  return { ok: failedCritical.length === 0, dependencies };
}

function sanitizedPath(req) {
  try {
    return new URL(req.url || '/', 'http://crewcheck.local').pathname;
  } catch {
    return '/';
  }
}

function logRequest(data) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: 'http_request',
    ...data,
  }));
}

http.createServer = function observedCreateServer(...args) {
  const listenerIndex = typeof args[0] === 'function' ? 0 : 1;
  const originalListener = args[listenerIndex];
  if (typeof originalListener !== 'function') return originalCreateServer(...args);

  args[listenerIndex] = async function observedListener(req, res) {
    const id = requestId(req);
    const started = Date.now();
    const path = sanitizedPath(req);
    counters.requests += 1;
    counters.inFlight += 1;
    counters.peakInFlight = Math.max(counters.peakInFlight, counters.inFlight);
    res.setHeader('x-request-id', id);

    let finalized = false;
    const finalize = () => {
      if (finalized) return;
      finalized = true;
      const durationMs = Date.now() - started;
      counters.inFlight = Math.max(0, counters.inFlight - 1);
      counters.totalDurationMs += durationMs;
      if (Number(res.statusCode || 200) >= 500) counters.errors5xx += 1;
      logRequest({
        requestId: id,
        method: String(req.method || 'GET'),
        path,
        statusCode: Number(res.statusCode || 200),
        durationMs,
      });
    };
    res.once('finish', finalize);
    res.once('close', finalize);

    try {
      if (path === '/health/live') {
        return sendJson(res, 200, { ok: true, status: 'live', ...publicRuntime() });
      }
      if (path === '/health/ready') {
        const memory = memorySnapshot();
        const ready = memory.heapUsedMb < Number(process.env.CREWCHECK_MAX_READY_HEAP_MB || 850);
        return sendJson(res, ready ? 200 : 503, { ok: ready, status: ready ? 'ready' : 'degraded', ...publicRuntime() });
      }
      if (path === '/health/dependencies') {
        const snapshot = await dependencySnapshot();
        return sendJson(res, snapshot.ok ? 200 : 503, { ...snapshot, ...publicRuntime() });
      }
      if (path === '/health/metrics') {
        return sendJson(res, 200, { ok: true, ...publicRuntime() });
      }
      return await originalListener.call(this, req, res);
    } catch (error) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'http_unhandled_error',
        requestId: id,
        method: String(req.method || 'GET'),
        path,
        message: error instanceof Error ? error.message : 'unknown',
      }));
      return sendJson(res, 500, { ok: false, requestId: id, message: 'O CrewCheck encontrou uma falha temporária.' });
    }
  };

  return originalCreateServer(...args);
};

await import('./server.mjs');
