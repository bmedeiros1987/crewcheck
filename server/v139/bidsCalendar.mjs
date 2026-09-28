import { requireIdentity } from './common.mjs';

function dateValue(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function icsDate(value) {
  const date = dateValue(value);
  return date ? date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z') : '';
}

function escapeIcs(value = '') {
  return String(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

export async function handleBidsCalendar(req, res, url) {
  if (url.pathname !== '/api/platform/bids/calendar') return false;
  const context = await requireIdentity(req, res);
  if (!context) return true;
  const [rows] = await context.db.query('SELECT * FROM crewcheck_platform_bid_windows WHERE owner_email=? ORDER BY opens_at', [context.email]);
  const events = rows.map((row) => [
    'BEGIN:VEVENT',
    `UID:${row.id}@crewcheck.online`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(row.opens_at)}`,
    `DTEND:${icsDate(row.closes_at)}`,
    `SUMMARY:${escapeIcs(`BIDS — ${row.title}`)}`,
    `DESCRIPTION:${escapeIcs(`Janela de solicitação para ${row.target_month}.`)}`,
    row.provider_url ? `URL:${escapeIcs(row.provider_url)}` : '',
    'BEGIN:VALARM',
    'TRIGGER:PT0M',
    'ACTION:DISPLAY',
    'DESCRIPTION:A janela de BIDS abriu.',
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    'DESCRIPTION:Último dia da janela de BIDS amanhã.',
    'END:VALARM',
    'END:VEVENT',
  ].filter(Boolean).join('\r\n')).join('\r\n');
  const calendar = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CrewCheck//BIDS//PT-BR', 'CALSCALE:GREGORIAN', events, 'END:VCALENDAR'].join('\r\n');
  res.writeHead(200, {
    'content-type': 'text/calendar; charset=utf-8',
    'content-disposition': 'attachment; filename="crewcheck-bids.ics"',
    'cache-control': 'no-store',
  });
  res.end(calendar);
  return true;
}
