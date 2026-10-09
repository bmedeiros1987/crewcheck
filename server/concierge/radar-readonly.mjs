import { dbPool, safeEmail } from '../v139/common.mjs';
import { privateStayMenuOwner } from './stay-menu.mjs';
import { radarReadIntent, radarCivilDate } from '../../shared/conciergeRadarIntent.mjs';
export { radarReadIntent, radarCivilDate } from '../../shared/conciergeRadarIntent.mjs';

const clean = (value, max = 160) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const flight = value => clean(value, 24).replace(/\s+/g, '').toUpperCase().replace(/^LAN(?=\d)/, 'LA').replace(/^TAM(?=\d)/, 'JJ');
export function radarReadOwner(profile = {}) {
  // Visitor permission is not an owner identity. Follow lists are private even
  // when a visitor has permission to view radar for a shared roster.
  if (profile.visitorId || profile.ownerEmail || profile.role === 'visitor' || profile.visitor === true) return '';
  if (!['app','telegram'].includes(profile.channel)) return '';
  return privateStayMenuOwner(profile);
}
export async function readFollowedRadar(owner, query = {}, getPool = dbPool) {
  const email = safeEmail(owner);
  if (!email) throw new Error('RADAR_OWNER_REQUIRED');
  const db = await getPool();
  if (!db) throw new Error('RADAR_SAVED_UNAVAILABLE');
  const number = flight(query.flight), date = radarCivilDate(query.date);
  const occurrence = number && date;
  const variants = [number, number.replace(/^LA(?=\d)/,'LAN').replace(/^JJ(?=\d)/,'TAM')];
  const [rows] = await db.query(`SELECT owner_email,flight_number,DATE_FORMAT(flight_date,'%Y-%m-%d') AS flight_date,
    origin,destination,last_snapshot,last_checked_at
    FROM crewcheck_platform_flight_follows WHERE owner_email=? AND status='active'
    ${occurrence ? 'AND flight_number IN (?,?) AND flight_date=?' : ''}
    ORDER BY flight_date,flight_number LIMIT 21`, occurrence ? [email,...variants,date] : [email]);
  // Check returned identity as well as SQL scope; never promote a foreign row.
  return (rows || []).filter(row => safeEmail(row.owner_email) === email).map(row => ({
    flight: flight(row.flight_number), date: radarCivilDate(row.flight_date), origin: clean(row.origin, 8), destination: clean(row.destination, 8),
    checkedAt: row.last_checked_at instanceof Date ? row.last_checked_at.toISOString() : clean(row.last_checked_at, 40),
    snapshot: typeof row.last_snapshot === 'string' ? JSON.parse(row.last_snapshot) : row.last_snapshot,
  })).filter(row => /^[A-Z0-9]{2,3}\d{1,6}$/.test(row.flight) && row.date);
}
export function formatSavedRadar(record) {
  const data = record?.snapshot;
  if (!data || data.ok !== true || flight(data.flight || data.ident) !== record.flight) return '';
  if (data.operationalDate && radarCivilDate(data.operationalDate) !== record.date) return '';
  const updated = clean(data.updatedAt || record.checkedAt, 40);
  const validTime = updated && Number.isFinite(Date.parse(updated));
  const lines = [`Radar ${record.flight} · ${record.date}`, 'Consulta salva; não confirma a situação ao vivo.',
    `Fonte: ${clean(data.source || data.provider) || 'não informada'}`,
    `Última atualização: ${validTime ? updated : 'não informada'}`];
  for (const [label,key] of [['Status','status'],['Partida informada','departure'],['Chegada informada','arrival'],['Portão','gate'],['Terminal','terminal']]) {
    if (clean(data[key])) lines.push(`${label}: ${clean(data[key])}`);
  }
  const numericDelay = typeof data.delayMinutes === 'number' || (typeof data.delayMinutes === 'string' && /^\d+(?:\.\d+)?$/.test(data.delayMinutes.trim()));
  if (numericDelay && Number.isFinite(Number(data.delayMinutes)) && Number(data.delayMinutes) >= 0) lines.push(`Atraso informado: ${Number(data.delayMinutes)} min`);
  return lines.join('\n');
}
export async function radarReadReply(text, profile = {}, snapshot = null, deps = {}) {
  const intent = radarReadIntent(text);
  if (!intent) return { handled: false };
  const done = reply => ({ handled: true, reply });
  const owner = radarReadOwner(profile);
  if (!owner) return done('Consulte o Radar no app autenticado ou na conversa privada do titular vinculada ao Telegram. A lista de voos seguidos é privada.');
  if (intent.ambiguous) return done('Qual voo e qual data você quer consultar? Envie uma companhia/número e uma data completa por vez.');
  if (intent.kind === 'flight' && !intent.flight) return done('Qual é a companhia e o número do voo? Exemplo: /radar LA1234 2026-10-09.');
  if (intent.kind === 'flight' && (!intent.date || intent.invalidDate)) return done(`Qual é a data completa do voo ${intent.flight}? Use DD/MM/AAAA ou AAAA-MM-DD; o número pode se repetir em dias diferentes.`);
  try {
    const records = await (deps.read || readFollowedRadar)(owner, intent);
    if (intent.kind === 'followed') {
      if (!records.length) return done('Não há voos seguidos salvos para sua conta. A consulta não inicia acompanhamento nem chama provedores.');
      return done(['Voos seguidos salvos · sua conta', ...records.slice(0,20).map(row => `• ${row.flight} · ${row.date}`),
        records.length > 20 ? 'Lista limitada aos primeiros 20 registros.' : '', 'Para consultar: /radar COMPANHIA1234 AAAA-MM-DD.'].filter(Boolean).join('\n'));
    }
    const record = records.find(row => row.flight === intent.flight && row.date === intent.date);
    let reply = record && formatSavedRadar(record);
    // Reuse only an account-owned snapshot with explicit occurrence identity.
    const radar = snapshot?.lastRadar;
    if (!reply && safeEmail(snapshot?.email) === owner && radarCivilDate(radar?.operationalDate) === intent.date) reply = formatSavedRadar({ flight:intent.flight,date:intent.date,snapshot:radar });
    return done(reply || `Não há informação salva confirmada para ${intent.flight} em ${intent.date}. Consulte o Radar no app; cobertura e dados dependem da fonte. Esta conversa não fez consulta externa nem iniciou acompanhamento.`);
  } catch { return done('Não consegui consultar os dados salvos do Radar agora. Nenhuma consulta externa foi feita.'); }
}
