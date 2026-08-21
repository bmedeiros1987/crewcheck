// Parser de escala consolidado do CrewCheck.
// Mantém compatibilidade com PDFs AIMS e Crew Roster Report sem depender do navegador.

import { fileURLToPath } from 'node:url';

const AIRPORTS = new Set(['AAX','AEP','AFL','AJU','AMS','ARU','ASU','ATL','ATM','BCN','BEL','BOG','BOS','BPS','BRA','BSB','BVB','CAC','CAW','CCS','CDG','CFB','CGB','CGH','CKS','CLO','CMG','CNF','COR','CPT','CPV','CTG','CUN','CUR','CUZ','CWB','CXJ','DFW','DOH','DXB','EPA','ERM','EWR','EZE','FCO','FEC','FEN','FLL','FLN','FOR','FRA','GIG','GPB','GRU','GVR','GYE','GYN','HAV','IAH','IGU','IMP','IOS','IPN','IST','IZA','JDO','JFK','JIA','JJD','JJG','JNB','JOI','JPA','JPR','JTC','LAS','LAX','LAZ','LDB','LEC','LGW','LHR','LIM','LIS','LPB','MAB','MAD','MAO','MCO','MCP','MCZ','MDE','MDZ','MEA','MEX','MGF','MIA','MOC','MUC','MVD','MXP','NAT','NVT','OAL','OPO','OPS','ORD','ORY','PDP','PET','PFB','PIN','PMW','PNZ','POA','PPB','PTY','PUJ','PVH','QNS','RAO','RBR','REC','RIA','ROO','ROS','RVD','SCL','SDQ','SDU','SFO','SJK','SJO','SJP','SLZ','SSA','STM','TBT','TFF','THE','UDI','UIO','URG','VCP','VDC','VIX','VVI','XAP','ZRH']);
const MONTHS = { jan:1, feb:2, fev:2, mar:3, apr:4, abr:4, may:5, mai:5, ma:5, jun:6, jul:7, aug:8, ago:8, sep:9, set:9, oct:10, out:10, nov:11, dec:12, dez:12 };

const NON_AIRPORT_TOKEN_V3 = new Set(['LA','OP','PS','DH','PAX','EXTRA','PASSAGEIRO','APRES','APRESENTA','APRESENTACAO','APRESENTAÇÃO','REPORT','CHECKIN','CHECK-IN','HSB','HSBE','ASB','RES','CRM','CRMB','CRMBSB','MT','CBF','EMER','CNA','DO','DOF','DOP','DOPR','DR','OFF','VC','NS','NSJ','IJ','DM','FH']);
const WEEKDAYS_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function isAirportCodeToken(value) {
 const clean = String(value || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
 if (!clean) return false;
 if (AIRPORTS.has(clean)) return true;
 return /^[A-Z]{3}$/.test(clean) && !NON_AIRPORT_TOKEN_V3.has(clean) && !MONTHS[String(clean).toLowerCase()];
}

function decodeBase64PdfPayload(dataBase64) {
 const payload = String(dataBase64 || '').trim();
 if (!payload) return Buffer.alloc(0);
 const commaIndex = payload.indexOf(',');
 const base64 = payload.startsWith('data:') && commaIndex >= 0 ? payload.slice(commaIndex + 1) : payload;
 const cleaned = base64.replace(/\s+/g, '');
 const bytes = Buffer.from(cleaned, 'base64');
 if (bytes.slice(0, 4).toString('utf8') !== '%PDF') {
  const direct = Buffer.from(payload);
  if (direct.slice(0, 4).toString('utf8') === '%PDF') return direct;
 }
 return bytes;
}

async function parsePdfOnServer({ filename, dataBase64 }) {
 if (!dataBase64 || typeof dataBase64 !== 'string') throw new Error('PDF não recebido pelo servidor.');
 const bytes = decodeBase64PdfPayload(dataBase64);
 if (!bytes.length) throw new Error('PDF vazio.');
 const pdfjsModuleUrl = import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs');
 const pdfjsAssetRoot = new URL('../../', pdfjsModuleUrl);
 const pdfjsAssetPath = fileURLToPath(pdfjsAssetRoot);
 const pdfjsImport = await import(pdfjsModuleUrl);
 const pdfjs = pdfjsImport.default || pdfjsImport;
 const pdf = await pdfjs.getDocument({
  data: new Uint8Array(bytes),
  disableWorker: true,
  isEvalSupported: false,
  disableFontFace: true,
  cMapUrl: `${pdfjsAssetPath}cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${pdfjsAssetPath}standard_fonts/`,
  wasmUrl: `${pdfjsAssetPath}wasm/`,
 }).promise;
 const pages = [];
 const allItems = [];
 for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
  const page = await pdf.getPage(pageNo);
  const tc = await page.getTextContent();
  const items = tc.items.map((it) => ({
   str: String(it.str || '').trim(),
   x: Number(it.transform?.[4] || 0),
   y: Number(it.transform?.[5] || 0),
   page: pageNo,
  })).filter((it) => it.str);
  allItems.push(...items);
  pages.push({ pageNo, items });
 }
 const fullText = buildServerFullText(pages);
 const isAims = /Convertida para padr/i.test(fullText) || /Tripulante:/i.test(fullText);
 const roster = isAims ? parseServerAims(fullText, pages) : parseServerRosterReport(fullText, pages, filename);
 roster.rawText = fullText;
 roster.days = finalizeServerDays(roster.days, roster.month, roster.year, roster.base);
 const diagnostics = buildParseDiagnostics(roster, isAims ? 'AIMS' : 'CrewRosterReport');
 return { roster, diagnostics };
}

function buildServerFullText(pages) {
 return pages.map(({ items }) => {
  const rows = [];
  const sorted = [...items].sort((a,b) => b.y - a.y || a.x - b.x);
  for (const item of sorted) {
   let row = rows.find((r) => Math.abs(r.y - item.y) <= 3);
   if (!row) { row = { y: item.y, items: [] }; rows.push(row); }
   row.items.push(item);
  }
  return rows.sort((a,b)=>b.y-a.y).map((r)=>r.items.sort((a,b)=>a.x-b.x).map((i)=>i.str).join(' ').replace(/\s+/g,' ').trim()).join('\n');
 }).join('\n');
}

function parseServerHeader(fullText, filename='') {
 const compact = fullText.replace(/\s+/g, ' ');
 let crewName = 'Tripulante', crewId = '', base = 'BSB', rank = 'CCM', month = new Date().getMonth()+1, year = new Date().getFullYear();
 const a = compact.match(/Tripulante:\s*([^-]+?)\s*-\s*BP:\s*(\d+)\s*-\s*Base:\s*([A-Z]{3})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})\s*at[ée]\s*(\d{2})\/(\d{2})\/(\d{4})/i);
 if (a) { crewName=a[1].trim(); crewId=a[2]; base=a[3]; month=Number(a[5]); year=Number(a[6]); }
 const r = compact.match(/Roster\s+Report\s+(\d{2})-([A-Za-z]{3})-(\d{4})\s+to\s+(\d{2})-([A-Za-z]{3})-(\d{4})\s+(.+?)\s*\|\s*(\d{6,})\s*\|\s*([A-Z0-9]+)\s*\|\s*([A-Z]{3})\s*\|\s*([A-Z]{2,5})/i);
 if (r) { month=monthNameToNum(r[2]); year=Number(r[3]); crewName=r[7].trim(); crewId=r[8]; base=r[10]; rank=r[11]; }
 return { crewName, crewId, base, rank, month, year, airline: /\bLA\s?\d{3,4}\b/i.test(fullText) ? 'LATAM' : 'Companhia aérea' };
}

function monthNameToNum(v) { return MONTHS[String(v||'').slice(0,3).toLowerCase()] || 0; }

function dateObj(day, month, year) { const d = new Date(year, month-1, day); return { date: `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`, dayOfWeek: WEEKDAYS_PT[d.getDay()] }; }

function makeDay(day, month, year, base) { const d = dateObj(day, month, year); return { date:d.date, dayOfWeek:d.dayOfWeek, dayNumber:day, month, year, type:'OTHER', pairingCode:'', dutyReport:null, dutyDebrief:null, legs:[], dutyHours:null, flyingHours:null, isNextDay:false, hotel:null, base, rawText:'' }; }

function buildRosterDateBlocksV3(fullText) {
 const lines = fullText.split(/\n+/).map((line) => cleanRosterLineV3(line)).filter(Boolean);
 const blocks = [];
 let current = null;
 const dateAtStart = /^\s*(\d{2})-([A-Za-z]{3})-(\d{4})\b\s*(.*)$/;
 for (const line of lines) {
  if (/^(Roster Report|Date\s+|Duty\s+|Report\s+|Updated By|Updated Date|A\/C|Type\s*$)/i.test(line)) continue;
  const match = line.match(dateAtStart);
  if (match) {
   if (current) blocks.push(current);
   current = { dayToken: match[1], monthToken: match[2], yearToken: match[3], text: match[4] || '' };
   continue;
  }
  if (current && isRosterContinuationV3(line)) {
   current.text += ' ' + line;
  }
 }
 if (current) blocks.push(current);
 return blocks;
}

function cleanRosterLineV3(line) {
 return String(line || '')
  .replace(/\u000c/g, ' ')
  .replace(/\uFFFE/g, ' ')
  .replace(/\b\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}\.\d{2}\b/g, ' ')
  .replace(/\b(SCHEDULER|msgsys|\d{6,})\b/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();
}

function isRosterContinuationV3(line) {
 return /\b(LA\s?\d{3,4}|DOPR|DOP|DOF?|DR|OFF|VC|HSBE?|ASB|CBF|EMER|MT|CRM|C\d{2,3}F|NSJ?|IJ|DM|[A-Z]{3}\s+\d{1,2}:\d{2}|\d{1,2}:\d{2}\(\+1\))\b/i.test(line);
}

function parseCrewRosterBlockV3(dayNumber, month, year, base, blockText) {
 const raw = cleanRosterLineV3(blockText);
 const upper = raw.toUpperCase();
 const events = [];
 const hasFlight = /\bLA\s?\d{3,4}\b/i.test(raw);
 const activityCodes = [...upper.matchAll(/\b(HSBE|HSB|ASB|CBF|EMER|C\d{2,3}F|MT|CRM|NSJ|NS|IJ|DM)\b/g)].map((m) => m[1]);
 const restMatch = upper.match(/\b(DOPR|DOP|DOF|DO|DR|OFF|VC)\b/);

 // Operational activities always win over rest markers in the same visual column/block.
 // This prevents ASB after an ellipsis/rest artifact from being converted to inativo/folga.
 for (const code of [...new Set(activityCodes)]) {
  const activity = makeDay(dayNumber, month, year, base);
  activity.rawText = raw;
  activity.pairingCode = code;
  activity.type = code === 'ASB' || code === 'HSB' || code === 'HSBE' ? code : (code === 'CRM' || /^C\d{2,3}F$/.test(code) || code === 'CBF' || code === 'EMER' ? 'CRM' : 'OTHER');
  const window = pickDutyWindowForCodeV3(raw, code);
  activity.dutyReport = window.start;
  activity.dutyDebrief = window.end;
  activity.dutyHours = window.start && window.end ? diffHours(window.start, window.end) : null;
  activity.flyingHours = 0;
  events.push(activity);
 }

 if (hasFlight) {
  const flightDay = makeDay(dayNumber, month, year, base);
  flightDay.rawText = raw;
  parseFlightsFromRosterTextV3(flightDay, raw);
  if (flightDay.legs.length) events.push(flightDay);
 }

 if (!events.length && restMatch) {
  const restDay = makeDay(dayNumber, month, year, base);
  restDay.rawText = raw;
  restDay.type = restMatch[1];
  restDay.pairingCode = restMatch[1];
  restDay.dutyHours = 0;
  restDay.flyingHours = 0;
  events.push(restDay);
 }

 if (!events.length && raw) {
  const other = makeDay(dayNumber, month, year, base);
  other.rawText = raw;
  events.push(other);
 }
 return events;
}

function pickDutyWindowForCodeV3(text, code) {
 const upper = String(text || '').toUpperCase();
 const codeIndex = upper.indexOf(String(code).toUpperCase());
 const fragment = codeIndex >= 0 ? text.slice(Math.max(0, codeIndex - 35), codeIndex + 180) : text;
 const stationTimes = [...fragment.matchAll(/\b[A-Z]{3}\s+(\d{1,2}:\d{2}(?:\(\+1\))?)\b/g)].map((m) => normalizeTimeToken(m[1]));
 if (stationTimes.length >= 2) return { start: stationTimes[0], end: stationTimes[stationTimes.length - 1] };
 const allTimes = uniqueTimesV3([...fragment.matchAll(/\b\d{1,2}:\d{2}(?:\(\+1\))?\b/g)].map((m) => normalizeTimeToken(m[0])));
 if (!allTimes.length) return { start: null, end: null };
 const start = allTimes[0];
 let end = allTimes[1] || allTimes[0];
 for (const time of allTimes.slice(1)) {
  const hours = diffHours(start, time);
  if (hours >= 0.25 && hours <= 14 && !looksLikeDurationV3(time)) end = time;
 }
 return { start, end };
}

function looksLikeDurationV3(time) {
 const normalized = normalizeTimeToken(time);
 // Common duration columns in CrewRosterReport/AIMS. They should never be used
 // as the end time for MT/ASB/HSB/HSBE.
 return ['00:59','01:25','01:40','01:45','01:50','02:00','02:05','02:10','02:15','02:25','02:30','02:40','02:45','02:50','03:10','03:15','03:25','03:35','03:38','03:59','04:00','04:35','04:42','05:20','06:00','06:25','07:30','07:35','07:40','07:55','08:10','08:20','08:55','10:30','10:45','10:55','11:15','11:25','11:30'].includes(normalized);
}

function uniqueTimesV3(times) {
 const out = [];
 for (const time of times) {
  if (/^\d{2}:\d{2}/.test(time) && !out.includes(time)) out.push(time);
 }
 return out;
}

function parseFlightsFromRosterTextV3(day, text) {
 const normalized = cleanRosterLineV3(text);
 const flightRe = /\b(LA\s?\d{3,4}|LA\d{3,4})\b([\s\S]*?)(?=\bLA\s?\d{3,4}\b|$)/gi;
 let match;
 while ((match = flightRe.exec(normalized)) !== null) {
  const flightNumber = match[1].replace(/\s+/g, '');
  const segment = match[2] || '';
  const leg = parseRosterFlightSegmentV3(flightNumber, segment);
  if (leg && !day.legs.some((item) => item.flightNumber === leg.flightNumber && item.origin === leg.origin && item.departureTime === leg.departureTime)) {
   day.legs.push(leg);
  }
 }
 if (day.legs.length) {
  assignPublishedLegPresentationsV3(day.legs, normalized);
  day.type = 'VOO';
  day.pairingCode = day.legs[0].flightNumber;
  const firstIdx = normalized.indexOf(day.legs[0].flightNumber);
  const beforeFirst = firstIdx > 0 ? normalized.slice(0, firstIdx) : normalized;
  const report = [...beforeFirst.matchAll(/\b\d{1,2}:\d{2}\b/g)].map((m) => normalizeTimeToken(m[0])).at(-1);
  day.dutyReport = report || day.legs[0].departureTime;
  const afterLast = normalized.slice(Math.max(0, normalized.lastIndexOf(day.legs.at(-1).arrivalTime)));
  const timesAfter = uniqueTimesV3([...afterLast.matchAll(/\b\d{1,2}:\d{2}(?:\(\+1\))?\b/g)].map((m) => normalizeTimeToken(m[0])));
  day.dutyDebrief = timesAfter.length >= 2 ? timesAfter[1] : (timesAfter[0] || day.legs.at(-1).arrivalTime);
  day.isNextDay = day.legs.some((leg) => leg.isNextDay) || diffHours(day.dutyReport, day.dutyDebrief) > 18;
  day.flyingHours = day.legs.reduce((sum, leg) => sum + (leg.duration || diffHours(leg.departureTime, leg.arrivalTime)), 0);
  day.dutyHours = diffHours(day.dutyReport, day.dutyDebrief);
 }
}

/**
 * Nas escalas CrewRosterReport as colunas de cada etapa terminam em
 * `<bloco> <jornada> <aeronave>`. Quando uma NOVA jornada começa no mesmo dia,
 * a apresentação publicada aparece depois do código de aeronave, imediatamente
 * antes do próximo número de voo. Esse é o único horário posterior à aeronave,
 * o que o distingue com segurança dos tempos de bloco/jornada.
 *
 * Preservar essa apresentação é o que impede a jornada seguinte de ser lida
 * como conexão da anterior e de perder a própria apresentação (#440, #512).
 */
function assignPublishedLegPresentationsV3(legs, normalized) {
 const aircraftRe = /\b(32S|31R|39R|328|319|320|321|32N)\b/g;
 const timeRe = /\b\d{1,2}:\d{2}(?:\(\+\d+\))?\b/g;
 for (let index = 1; index < legs.length; index += 1) {
  const previous = legs[index - 1];
  const current = legs[index];
  const previousArrivalAt = normalized.indexOf(previous.arrivalTime);
  if (previousArrivalAt < 0) continue;
  const currentFlightAt = normalized.indexOf(current.flightNumber, previousArrivalAt);
  if (currentFlightAt <= previousArrivalAt) continue;
  const between = normalized.slice(previousArrivalAt + previous.arrivalTime.length, currentFlightAt);
  aircraftRe.lastIndex = 0;
  let lastAircraftEnd = -1;
  let aircraftMatch;
  while ((aircraftMatch = aircraftRe.exec(between)) !== null) lastAircraftEnd = aircraftMatch.index + aircraftMatch[0].length;
  if (lastAircraftEnd < 0) continue;
  const afterAircraft = between.slice(lastAircraftEnd);
  timeRe.lastIndex = 0;
  const candidate = [...afterAircraft.matchAll(timeRe)].map((match) => normalizeTimeToken(match[0])).at(-1);
  if (!candidate) continue;
  // Apresentação precede a decolagem e nunca por mais de 3h.
  const lead = toMin(current.departureTime) - toMin(candidate);
  if (lead <= 0 || lead > 180) continue;
  current.presentationTime = candidate;
 }
}

function parseRosterFlightSegmentV3(flightNumber, segment) {
 const tokens = String(segment || '').split(/\s+/).filter(Boolean);
 let workType = 'OP';
 let aircraftType = undefined;
 for (const token of tokens) {
  const upper = token.toUpperCase();
  if (['OP','PS','DH'].includes(upper)) workType = upper;
  if (['EXTRA','[EXTRA]','PAX','PASSAGEIRO'].includes(upper)) workType = 'PS';
  if (/^(32S|31R|39R|328|319|320|321|32N)$/.test(upper)) aircraftType = upper;
 }
 const pattern = findBestFlightPatternV3(tokens);
 if (!pattern) return null;
 const { origin, destination, departureTime, arrivalTime } = pattern;
 const isNextDay = /\(\+1\)/.test(arrivalTime) || toMin(arrivalTime) < toMin(departureTime);
 return { flightNumber, origin, destination, departureTime, arrivalTime: normalizeTimeToken(arrivalTime), workType, aircraftType, isNextDay, duration: diffHours(departureTime, arrivalTime) };
}

function findBestFlightPatternV3(tokens) {
 const upper = tokens.map((token) => String(token || '').toUpperCase());
 const timeItems = tokens.map((token, idx) => ({ token, idx })).filter((item) => isTimeToken(item.token));
 const candidates = [];
 const scoreCandidate = (originIdx, depItem, destIdx, arrItem, source) => {
  const origin = upper[originIdx];
  const destination = upper[destIdx];
  if (!isAirportCodeToken(origin) || !isAirportCodeToken(destination) || origin === destination) return;
  if (!depItem || !arrItem || arrItem.idx <= destIdx) return;
  const departureTime = normalizeTimeToken(depItem.token);
  const arrivalTime = normalizeTimeToken(arrItem.token);
  const duration = diffHours(departureTime, arrivalTime);
  if (duration < 0.25 || duration > 8.5) return;
  const orderBonus = source === 'airport-time-airport-time' ? 8 : 0;
  const distancePenalty = Math.abs(destIdx - originIdx - 2);
  const score = 140 + orderBonus - Math.abs(duration - 1.8) * 6 - distancePenalty;
  candidates.push({ origin, destination, departureTime, arrivalTime, score });
 };

 for (let i = 0; i < upper.length; i++) {
  if (!isAirportCodeToken(upper[i])) continue;

  // Padrão clássico AIMS/CrewRoster: ORIGEM HORA DESTINO HORA.
  for (let j = i + 1; j < Math.min(upper.length, i + 6); j++) {
   if (!isTimeToken(tokens[j])) continue;
   for (let k = j + 1; k < Math.min(upper.length, j + 6); k++) {
    if (!isAirportCodeToken(upper[k])) continue;
    for (let l = k + 1; l < Math.min(upper.length, k + 6); l++) {
     if (!isTimeToken(tokens[l])) continue;
     scoreCandidate(i, { token: tokens[j], idx: j }, k, { token: tokens[l], idx: l }, 'airport-time-airport-time');
    }
   }
  }

  // Padrão visual quebrado no celular: HORA ORIGEM DESTINO HORA.
  const depBefore = [...timeItems].reverse().find((item) => item.idx < i && i - item.idx <= 4);
  if (depBefore) {
   for (let k = i + 1; k < Math.min(upper.length, i + 6); k++) {
    if (!isAirportCodeToken(upper[k])) continue;
    const arrAfter = timeItems.find((item) => item.idx > k && item.idx - k <= 5);
    if (arrAfter) scoreCandidate(i, depBefore, k, arrAfter, 'time-airport-airport-time');
   }
  }
 }
 candidates.sort((a, b) => b.score - a.score);
 return candidates[0] || null;
}

function parseAimsTokensIntoEventsV3(tokens, dayNum, month, year, base) {
 const normalized = tokens.map((token) => String(token || '').trim()).filter(Boolean);
 const upperTokens = normalized.map((token) => token.toUpperCase());
 const joined = upperTokens.join(' ');
 const events = [];
 const activityCodes = [];
 for (let i = 0; i < upperTokens.length; i++) {
  const token = upperTokens[i];
  if (['HSB','HSBE','ASB','CBF','EMER','MT','CRM','NS','NSJ','IJ','DM'].includes(token) || /^C\d{2,3}F$/.test(token)) activityCodes.push({ code: token, index: i });
 }
 for (const { code, index } of activityCodes) {
  const day = makeDay(dayNum, month, year, base);
  day.rawText = normalized.join(' ');
  day.pairingCode = code;
  day.type = code === 'HSB' || code === 'HSBE' || code === 'ASB' ? code : (code === 'CRM' || /^C\d{2,3}F$/.test(code) || code === 'CBF' || code === 'EMER' ? 'CRM' : 'OTHER');
  const window = pickDutyWindowFromAimsTokensV3(normalized, index);
  day.dutyReport = window.start;
  day.dutyDebrief = window.end;
  day.dutyHours = window.start && window.end ? diffHours(window.start, window.end) : null;
  day.flyingHours = 0;
  events.push(day);
 }
 // Uma coluna de dia civil no AIMS/Escala pode conter mais de um bloco de
 // jornada: um resíduo "(...)" da jornada da madrugada anterior (que não é
 // apresentação de hoje), duas jornadas civis reais no mesmo dia, e pernas de
 // CONEXÃO de uma mesma jornada que também imprimem dois horários (programado
 // + realizado) antes da própria origem — não só a primeira perna da jornada.
 // Contar "dois horários antes do aeroporto" sozinho não basta: isso fundia
 // corretamente LA4712+LA3246 (jornadas diferentes) mas também fragmentava
 // LA3558+LA3559+LA4631 (uma única jornada com conexões curtas), porque cada
 // perna de conexão também imprime seu próprio par de horários.
 //
 // O sinal real de NOVA jornada é físico: o intervalo desde o fim da perna
 // anterior até a apresentação/horário desta perna. Conexão = minutos; nova
 // jornada = pernoite/folga real. Usamos o mesmo limiar de 12h já validado no
 // cliente (aimsParser.ts::buildAimsHumanFlightDays) para a mesma decisão.
 const laIndexes = [];
 for (let i = 0; i < upperTokens.length; i++) {
  if (upperTokens[i] === 'LA' && /^\d{3,4}$/.test(upperTokens[i + 1] || '')) laIndexes.push(i);
 }

 const segments = [];
 for (let k = 0; k < laIndexes.length; k++) {
  const i = laIndexes[k];
  const nextLaIndex = k < laIndexes.length - 1 ? laIndexes[k + 1] : normalized.length;
  // Um marcador EXTRA/PS/PAX/PASSAGEIRO colado ao FIM da janela desta perna
  // (logo antes do próximo "LA") descreve a PRÓXIMA perna, não esta — excluir
  // do seq evita que parseAimsFlightSeq contamine o workType da perna errada
  // (a perna anterior não pode virar PS só porque a seguinte é).
  let seqEnd = nextLaIndex;
  while (seqEnd > i + 2 && ['EXTRA', '[EXTRA]', 'PS', 'PAX', 'PASSAGEIRO'].includes(upperTokens[seqEnd - 1])) seqEnd -= 1;
  const seq = normalized.slice(i + 2, seqEnd);
  const leg = parseAimsFlightSeq('LA' + upperTokens[i + 1], seq);
  // O marcador pertence ao "LA" que ele precede, então este olhar é sempre
  // absoluto na coluna inteira — nunca relativo a um segmento já decidido,
  // senão um marcador colado numa perna que abre jornada nova fica preso ao
  // segmento anterior e corrompe o workType da perna errada.
  const hasLeadingExtraMarker = upperTokens
   .slice(Math.max(0, i - 4), i)
   .some((token) => ['EXTRA', '[EXTRA]', 'PS', 'PAX', 'PASSAGEIRO'].includes(token));
  if (leg && hasLeadingExtraMarker) leg.workType = 'PS';

  let reportEquivalent = null;
  let destIdx = -1;
  let afterDestTimeIndexes = [];
  if (leg) {
   const originIdx = upperTokens.findIndex((token, idx) => idx >= i + 2 && idx < seqEnd && token === leg.origin);
   if (originIdx >= 0) {
    const timesBeforeOrigin = normalized.slice(i + 2, originIdx).filter(isTimeToken).map(normalizeTimeToken);
    if (timesBeforeOrigin.length >= 2) reportEquivalent = timesBeforeOrigin[0];
    destIdx = upperTokens.findIndex((token, idx) => idx > originIdx && idx < seqEnd && token === leg.destination);
    if (destIdx >= 0) {
     for (let idx = destIdx + 1; idx < seqEnd; idx++) {
      if (isTimeToken(normalized[idx])) afterDestTimeIndexes.push(idx);
     }
    }
   }
  }
  const afterDestCount = afterDestTimeIndexes.length;
  // Quando a apresentação já está impressa dentro do bloco LA atual, ela não
  // disputa nenhum horário pós-destino da perna anterior. Preserve o debrief
  // legítimo anterior; o recorte anti-vazamento só se aplica ao fallback
  // ambíguo imediatamente antes de LA.
  const reportResolvedInsideCurrentLaBlock = Boolean(reportEquivalent);

  const current = segments[segments.length - 1];
  // Apresentação impressa ANTES do "LA" (não entre "LA" e a origem) só é
  // reconhecida quando há um sinal estrutural que a distingue de um debrief
  // legítimo da jornada anterior ou de um resíduo de boundary:
  // - k===0 (primeiro "LA" da coluna) sem nenhum "(...)" antes dele: coluna
  //   genuinamente limpa, sempre seguro.
  // - k===0 COM "(...)" antes: o resíduo de boundary (mesmo marcador que
  //   stitchServerAimsMidnightColumns usa via regex /^\(\.{3}\)$/ para
  //   virada de meia-noite) sempre contribui NO MÁXIMO 2 horários própios
  //   (chegada + debrief opcional) logo após a estação — é exatamente o
  //   formato que essa função produz ao substituir o "(...)". Um 3º horário
  //   além desses dois não pode pertencer ao boundary; só pode ser a
  //   apresentação própria desta perna. Com 2 ou menos horários desde o
  //   último "(...)", todos pertencem ao boundary — fica REVIEW.
  // - k>0: só quando a perna anterior tem 3+ horários após o próprio destino.
  //   Os dois primeiros formam o par chegada+debrief legítimo dela; o 3º é
  //   estruturalmente excedente e pertence a esta apresentação.
  // Com exatamente 2 horários na perna anterior (ex.: LA3559→LA4631) a
  // ambiguidade é irresolúvel: o 2º pode ser tanto o debrief legítimo da
  // perna anterior quanto a apresentação desta. Sem um sinal que distinga os
  // dois casos, fica REVIEW (dutyReport=null) — nunca inventada, nunca
  // contaminando a jornada anterior (#510).
  if (!reportEquivalent && i > 0 && isTimeToken(tokens[i - 1])) {
   if (k === 0) {
    let lastBoundaryIdx = -1;
    for (let b = i - 1; b >= 0; b--) {
     if (/^\(\.{3}\)$/.test(upperTokens[b])) { lastBoundaryIdx = b; break; }
    }
    if (lastBoundaryIdx < 0) {
     reportEquivalent = normalizeTimeToken(normalized[i - 1]);
    } else {
     const timesSinceBoundary = normalized.slice(lastBoundaryIdx + 1, i).filter(isTimeToken).length;
     if (timesSinceBoundary >= 3) reportEquivalent = normalizeTimeToken(normalized[i - 1]);
    }
   } else if (current && current.lastLegAfterDestCount >= 3) {
    reportEquivalent = normalizeTimeToken(normalized[i - 1]);
   }
  }

  // Se a apresentação atual é inequívoca, os dois primeiros horários após o
  // destino anterior também são inequívocos: chegada + fim da jornada. Meça
  // o descanso desde esse fim/debrief, como faz o parser canônico. No caso
  // pré-LA de exatamente dois horários a ambiguidade permanece; ali seguimos
  // usando a chegada para não transformar a possível APZ em debrief.
  const previousDebriefIsUnambiguous = Boolean(
   current
   && current.lastLegAfterDestTimeIndexes?.length >= 2
   && (reportResolvedInsideCurrentLaBlock || (reportEquivalent && current.lastLegAfterDestTimeIndexes.length >= 3))
  );
  const previousDutyEndForGap = previousDebriefIsUnambiguous
   ? normalizeTimeToken(normalized[current.lastLegAfterDestTimeIndexes[1]])
   : current?.lastArrival;

  const sameStation = Boolean(current && current.legs.length && leg && current.legs.at(-1).destination === leg.origin);
  let opensNewSegment;
  if (!current) {
   opensNewSegment = true;
  } else if (!leg || !current.lastArrival) {
   opensNewSegment = true;
  } else if (!sameStation) {
   // Descontinuidade física: a perna não pode ser conexão da jornada aberta,
   // não importa o intervalo — nunca fundir jornada fisicamente impossível.
   opensNewSegment = true;
  } else {
   // Com estação compatível, o sinal de nova jornada é o intervalo físico
   // desde o fim da perna anterior. Usa a apresentação própria quando
   // comprovada; sem ela, usa a partida real da própria perna só para medir
   // o intervalo (nunca como dutyReport — #510) — assim uma perna sem APZ
   // publicada depois de um descanso longo ainda abre jornada própria em vez
   // de herdar silenciosamente a apresentação da jornada anterior.
   const comparisonTime = reportEquivalent || leg.departureTime;
   const prevArrivalMin = toMin(current.lastArrival);
   let prevMin = toMin(previousDutyEndForGap);
   if (prevMin < prevArrivalMin) prevMin += 1440;
   let candMin = toMin(comparisonTime);
   // Ancore o próximo horário após a chegada, não após o debrief: em escalas
   // com pares programado/realizado a próxima apresentação pode anteceder em
   // poucos minutos o fim publicado (sobreposição, não virada de dia).
   if (candMin < prevArrivalMin) candMin += 1440;
   opensNewSegment = (candMin - prevMin) >= 12 * 60;
  }

  if (opensNewSegment) {
   // Quando a apresentação da nova jornada não está resolvida dentro do seu
   // próprio bloco LA, a anterior não pode reter, como se fosse debrief, o
   // horário ambíguo que pode pertencer à jornada que começa. Nesse fallback,
   // descarta exatamente o ÚLTIMO horário pós-destino quando
   // há 2 ou mais — o par chegada+debrief legítimo (os primeiros N-1) nunca é
   // tocado, só o excedente final é que é removido do cálculo de debrief.
   // Jornadas de perna única com só a chegada (ex.: LA4712, afterDestCount=1)
   // não são afetadas. O corte usa a POSIÇÃO REAL do penúltimo horário (não
   // "destIdx + contagem"), porque um token não-horário intercalado entre os
   // horários (ex.: matrícula de aeronave) quebraria essa aritmética e
   // cortaria também um horário legítimo antes do excedente real.
   if (!reportResolvedInsideCurrentLaBlock && current && current.lastLegAfterDestTimeIndexes && current.lastLegAfterDestTimeIndexes.length >= 2) {
    const keepUpToIdx = current.lastLegAfterDestTimeIndexes[current.lastLegAfterDestTimeIndexes.length - 2];
    current.tokenEnd = Math.min(current.tokenEnd, keepUpToIdx + 1);
   }
   segments.push({ reportEquivalent, legs: [], lastArrival: null, tokenStart: i });
  }
  const segment = segments[segments.length - 1];
  if (leg) {
   segment.legs.push(leg);
   segment.lastArrival = leg.arrivalTime;
   segment.tokenEnd = seqEnd;
   segment.lastLegDestIdx = destIdx;
   segment.lastLegAfterDestCount = afterDestCount;
   segment.lastLegAfterDestTimeIndexes = afterDestTimeIndexes;
  }
 }

 for (let s = 0; s < segments.length; s++) {
  const segment = segments[s];
  if (!segment.legs.length) continue;
  const flightDay = makeDay(dayNum, month, year, base);
  flightDay.rawText = normalized.join(' ');
  flightDay.type = 'VOO';
  flightDay.pairingCode = segment.legs[0].flightNumber;
  flightDay.legs = segment.legs;
  // Nenhum fallback para o horário de partida: se a apresentação própria não
  // está comprovada, dutyReport fica null. O consumidor deve tratar como
  // REVIEW, nunca copiar STD (#510).
  flightDay.dutyReport = segment.reportEquivalent || null;
  const segmentTokens = normalized.slice(segment.tokenStart, segment.tokenEnd);
  flightDay.dutyDebrief = inferAimsDebriefV3(segmentTokens, segment.legs.at(-1)) || segment.legs.at(-1).arrivalTime;
  flightDay.isNextDay = segment.legs.some((leg) => leg.isNextDay) || (flightDay.dutyReport ? diffHours(flightDay.dutyReport, flightDay.dutyDebrief) > 18 : false);
  flightDay.flyingHours = segment.legs.reduce((sum, leg) => sum + (leg.duration || diffHours(leg.departureTime, leg.arrivalTime)), 0);
  flightDay.dutyHours = flightDay.dutyReport ? diffHours(flightDay.dutyReport, flightDay.dutyDebrief) : null;
  events.push(flightDay);
 }
 if (!events.length) {
  const rest = joined.match(/\b(DOPR|DOP|DOF|DO|DR|OFF|VC)\b/);
  if (rest) {
   const day = makeDay(dayNum, month, year, base);
   day.rawText = normalized.join(' ');
   day.type = rest[1]; day.pairingCode = rest[1]; day.dutyHours = 0; day.flyingHours = 0;
   events.push(day);
  }
 }
 return events.length ? events : [makeDay(dayNum, month, year, base)];
}

function pickDutyWindowFromAimsTokensV3(tokens, index) {
 const slice = tokens.slice(index, Math.min(tokens.length, index + 18));
 const stationTimes = [];
 for (let i = 0; i < slice.length - 1; i++) {
  if (isAirportCodeToken(String(slice[i]).toUpperCase()) && isTimeToken(slice[i + 1])) stationTimes.push(normalizeTimeToken(slice[i + 1]));
 }
 if (stationTimes.length >= 2) return { start: stationTimes[0], end: stationTimes[stationTimes.length - 1] };
 const times = uniqueTimesV3(slice.filter(isTimeToken).map(normalizeTimeToken));
 if (!times.length) return { start: null, end: null };
 const start = times[0];
 let end = times[1] || times[0];
 for (const time of times.slice(1)) {
  const hours = diffHours(start, time);
  if (hours >= 0.25 && hours <= 14 && !looksLikeDurationV3(time)) end = time;
 }
 return { start, end };
}

function inferAimsDebriefV3(tokens, lastLeg) {
 if (!lastLeg) return null;
 const upper = tokens.map((token) => String(token).toUpperCase());
 const destIdx = upper.findLastIndex ? upper.findLastIndex((token) => token === lastLeg.destination) : (() => { for (let i=upper.length-1;i>=0;i--) if (upper[i]===lastLeg.destination) return i; return -1; })();
 if (destIdx < 0) return null;
 const after = tokens.slice(destIdx + 1).filter(isTimeToken).map(normalizeTimeToken);
 if (after.length >= 2) return after[1];
 return after[0] || null;
}

function buildServerRosterColumnGroups(pages) {
 const groups = [];
 for (const page of pages || []) {
  const relevant = (page.items || [])
   .map((item) => ({ ...item, str: cleanRosterLineV3(item.str) }))
   .filter((item) => item.str && item.x > 45 && item.y > 10 && !/^(LEGEND)$/i.test(item.str));
  const columns = [];
  for (const item of relevant.sort((a, b) => a.x - b.x || b.y - a.y)) {
   let column = columns.find((col) => Math.abs(col.x - item.x) <= 18);
   if (!column) {
    column = { x: item.x, page: item.page || page.pageNo, items: [] };
    columns.push(column);
   }
   column.items.push(item);
   column.x = column.items.reduce((sum, it) => sum + it.x, 0) / column.items.length;
  }
  for (const column of columns.sort((a, b) => a.x - b.x)) {
   const items = column.items.sort((a, b) => b.y - a.y || a.x - b.x);
   const text = cleanRosterLineV3(items.map((item) => item.str).join(' '));
   if (!text || /Roster Report|BRUNO|DH\s*:|FH\s*:|01-Jul-2026 to/i.test(text)) continue;
   if (!/\b(LA\s?\d{3,4}|OP|PS|DH|HSBE?|ASB|RCFI|DOPR|DOP|DOF?|DR|OFF|VC|BSB|GRU|CGH|FOR|CNF|MAB|CPV|VCP|JPA|GYN|FLN|PMW|MAO|BEL|NAT|SSA|CWB|CXJ)\b/i.test(text)) continue;
   groups.push({ page: column.page, x: column.x, items, text });
  }
 }
 return groups;
}

function serverDateFromToken(token, fallbackMonth, fallbackYear) {
 const match = String(token || '').match(/(\d{2})-([A-Za-z]{3})-(\d{4})/);
 if (!match) return null;
 return { day: Number(match[1]), month: monthNameToNum(match[2]) || fallbackMonth, year: Number(match[3]) || fallbackYear };
}

function addDaysToServerDate(marker, days) {
 const d = new Date(marker.year, marker.month - 1, marker.day, 12, 0, 0, 0);
 d.setDate(d.getDate() + Number(days || 0));
 return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
}

function serverDayOffsetFromToken(value) {
 const m = String(value || '').match(/\(\+(\d+)\)/);
 return m ? Number(m[1]) || 0 : 0;
}

function parseServerColumnarGroupToDay(group, currentMarker, base) {
 const items = group.items || [];
 const text = group.text || '';
 if (!currentMarker) return null;
 const flight = items.find((item) => /^LA\s?\d{3,4}$/i.test(item.str))?.str?.replace(/\s+/g, '').toUpperCase();
 const activity = text.match(/\b(HSBE|HSB|ASB|RCFI|CRMBSB|CRMB|CRM|C\d{2,3}F|MT|CBF|EMER)\b/i)?.[1]?.toUpperCase();
 const rest = text.match(/\b(DOPR|DOP|DOF|DO|DR|OFF|VC)\b/i)?.[1]?.toUpperCase();
 if (flight) return parseServerColumnarFlightDay(group, currentMarker, base, flight);
 if (activity) return parseServerColumnarActivityDay(group, currentMarker, base, activity);
 if (rest) {
  const marker = currentMarker;
  const day = makeDay(marker.day, marker.month, marker.year, base);
  day.rawText = text;
  day.type = rest === 'OFF' || rest === 'VC' || rest.startsWith('DOP') ? 'DO' : rest;
  day.pairingCode = rest;
  day.dutyHours = 0;
  day.flyingHours = 0;
  return day;
 }
 return null;
}

function parseServerColumnarFlightDay(group, currentMarker, base, flightNumber) {
 const items = group.items || [];
 const text = group.text || '';
 const flightIndex = items.findIndex((item) => /^LA\s?\d{3,4}$/i.test(item.str));
 const stationRows = serverTransposedStationTimeRows(items);
 if (stationRows.length < 2) return null;
 const [departureRow, arrivalRow] = stationRows;
 const origin = departureRow.airport;
 const rawDeparture = departureRow.time;
 const destination = arrivalRow.airport;
 const rawArrival = arrivalRow.time;
 const offset = Math.max(serverDayOffsetFromToken(rawDeparture), serverDayOffsetFromToken(rawArrival), serverDayOffsetFromToken(items.slice(Math.max(0, flightIndex)).map((item) => item.str).join(' ')));
 const day = makeDay(currentMarker.day, currentMarker.month, currentMarker.year, base);
 const departureTime = normalizeTimeToken(rawDeparture);
 const arrivalTime = normalizeTimeToken(rawArrival);
 const workType = items.find((item) => /^(OP|PS|DH)$/i.test(item.str))?.str?.toUpperCase() || 'OP';
 const aircraftType = items.find((item) => /^(32S|31R|39R|328|319|320|321|32N)$/i.test(item.str))?.str?.toUpperCase();
 const reportRaw = flightIndex >= 0 ? items.slice(flightIndex + 1).find((item) => /^\d{1,2}:\d{2}(?:\(\+\d+\))?$/.test(item.str))?.str : null;
 const destinationY = arrivalRow.y;
 const debriefRaw = Number.isFinite(destinationY)
  ? items.find((item) => item.y > Number(destinationY) && item.y < Number(destinationY) + 145 && /^\d{1,2}:\d{2}(?:\(\+\d+\))?$/.test(item.str))?.str || null
  : null;
 const isNextDay = serverDayOffsetFromToken(rawArrival) > serverDayOffsetFromToken(rawDeparture) || toMin(arrivalTime) < toMin(departureTime);
 day.rawText = text;
 day.type = 'VOO';
 day.pairingCode = flightNumber;
 day.dutyReport = reportRaw ? normalizeTimeToken(reportRaw) : departureTime;
 day.dutyDebrief = debriefRaw ? normalizeTimeToken(debriefRaw) : arrivalTime;
 day.isNextDay = isNextDay || offset > 0;
 day.legs = [{ flightNumber, origin, destination, departureTime, arrivalTime, workType, aircraftType, isNextDay, duration: diffHours(departureTime, arrivalTime) }];
 day.flyingHours = day.legs[0].duration;
 day.dutyHours = day.dutyReport && day.dutyDebrief ? diffHours(day.dutyReport, day.dutyDebrief) : null;
 return day;
}

function serverTransposedStationTimeRows(items) {
 const rows = [];
 for (const item of items || []) {
  let row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 2);
  if (!row) { row = { y: item.y, items: [] }; rows.push(row); }
  row.items.push(item);
 }
 return rows.map((row) => ({ y: row.y, text: row.items.sort((a, b) => a.x - b.x).map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim() }))
  .map((row) => ({ ...row, match: row.text.match(/^([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+\d+\))?)$/i) }))
  .filter((row) => row.match && isAirportCodeToken(row.match[1]))
  .map((row) => ({ airport: row.match[1].toUpperCase(), time: row.match[2], y: row.y }))
  .sort((a, b) => a.y - b.y)
  .slice(0, 2);
}

function parseServerColumnarActivityDay(group, currentMarker, base, rawCode) {
 const text = group.text || '';
 const code = rawCode === 'CRMBSB' || rawCode === 'CRMB' || /^C\d{2,3}F$/.test(rawCode) ? 'CRM' : rawCode;
 const marker = currentMarker;
 const day = makeDay(marker.day, marker.month, marker.year, base);
 day.rawText = text;
 day.pairingCode = code;
 day.type = code === 'ASB' || code === 'HSB' || code === 'HSBE' ? code : (code === 'RCFI' || code === 'CRM' || code === 'MT' || code === 'CBF' || code === 'EMER' ? 'CRM' : 'OTHER');
 const stationTimes = [...text.matchAll(/\b[A-Z]{3}\s+(\d{1,2}:\d{2}(?:\(\+\d+\))?)/g)].map((m) => normalizeTimeToken(m[1]));
 const times = stationTimes.length >= 2 ? stationTimes : [...text.matchAll(/\b\d{1,2}:\d{2}(?:\(\+\d+\))?\b/g)]
  .map((m) => normalizeTimeToken(m[0]))
  .filter((time) => time !== '00:00' && !looksLikeDurationV3(time));
 const unique = uniqueTimesV3(times).sort((a, b) => toMin(a) - toMin(b));
 day.dutyReport = unique[0] || null;
 day.dutyDebrief = unique.length > 1 ? unique[unique.length - 1] : null;
 day.flyingHours = 0;
 day.dutyHours = day.dutyReport && day.dutyDebrief ? diffHours(day.dutyReport, day.dutyDebrief) : null;
 return day;
}

function parseServerRosterReportColumnGroups(pages, h) {
 const groups = buildServerRosterColumnGroups(pages);
 const days = [];
 let currentMarker = null;
 let openFlightDuty = null;
 for (const group of groups) {
  const dateToken = group.text.match(/\d{2}-[A-Za-z]{3}-\d{4}/)?.[0] || null;
  if (dateToken) currentMarker = serverDateFromToken(dateToken, h.month, h.year);
  if (!currentMarker) continue;
  if (group.text.includes('<==') && !dateToken && !/\bLA\s?\d{3,4}\b/i.test(group.text)) continue;
  const day = parseServerColumnarGroupToDay(group, currentMarker, h.base);
  if (!day) continue;
  if (day.type !== 'VOO' && !dateToken) continue;
  if (day.month < h.month - 6) day.year = h.year + 1;
  if (day.type === 'VOO' && day.legs?.length && !dateToken && openFlightDuty) {
   for (const leg of day.legs) {
    if (!openFlightDuty.legs.some((old) => old.flightNumber === leg.flightNumber && old.origin === leg.origin && old.departureTime === leg.departureTime)) openFlightDuty.legs.push(leg);
   }
   openFlightDuty.rawText = `${openFlightDuty.rawText || ''} ${day.rawText || ''}`.trim();
   openFlightDuty.dutyReport = openFlightDuty.dutyReport || day.dutyReport || openFlightDuty.legs[0]?.departureTime || null;
   if (day.dutyDebrief) openFlightDuty.dutyDebrief = day.dutyDebrief;
   openFlightDuty.isNextDay = Boolean(openFlightDuty.isNextDay || day.isNextDay || openFlightDuty.legs.some((leg) => leg.isNextDay));
   openFlightDuty.flyingHours = openFlightDuty.legs.reduce((sum, leg) => sum + (leg.duration || 0), 0);
   openFlightDuty.dutyHours = openFlightDuty.dutyReport && openFlightDuty.dutyDebrief ? diffHours(openFlightDuty.dutyReport, openFlightDuty.dutyDebrief) : null;
   continue;
  }
  days.push(day);
  openFlightDuty = day.type === 'VOO' && day.legs?.length ? day : null;
 }
 return mergeServerRosterColumnDays(days, h.month, h.year);
}

function mergeServerRosterColumnDays(days, referenceMonth, referenceYear) {
 const buckets = new Map();
 for (const day of days) {
  if (!day) continue;
  const monthDistance = Math.abs((Number(day.year) * 12 + Number(day.month)) - (Number(referenceYear) * 12 + Number(referenceMonth)));
  if (monthDistance > 1) continue;
  const dateKey = day.date;
  const minuteKey = day.dutyReport || (day.legs?.[0]?.departureTime) || '99:99';
  const isFlight = day.type === 'VOO' && day.legs?.length;
  const key = isFlight ? `${dateKey}|VOO|${minuteKey}` : `${dateKey}|${day.pairingCode || day.type}|${minuteKey}`;
  const existing = buckets.get(key);
  if (existing && isFlight) {
   for (const leg of day.legs) if (!existing.legs.some((old) => old.flightNumber === leg.flightNumber && old.origin === leg.origin && old.departureTime === leg.departureTime)) existing.legs.push(leg);
   existing.legs.sort((a, b) => toMin(a.departureTime) - toMin(b.departureTime));
   existing.rawText = `${existing.rawText || ''} ${day.rawText || ''}`.trim();
   existing.pairingCode = existing.legs[0]?.flightNumber || existing.pairingCode;
   existing.flyingHours = existing.legs.reduce((sum, leg) => sum + (leg.duration || 0), 0);
   buckets.set(key, existing);
  } else if (!existing) {
   buckets.set(key, day);
  }
 }
 return Array.from(buckets.values());
}

function scoreServerRosterDays(days) {
 return (days || []).reduce((score, day) => score + (day.legs?.length || 0) * 3 + (day.pairingCode ? 1 : 0) + (day.type !== 'OTHER' ? 1 : 0), 0);
}

function parseServerRosterReport(fullText, pages, filename='') {
 const h = parseServerHeader(fullText, filename);
 const blocks = buildRosterDateBlocksV3(fullText);
 const textDays = [];
 for (const block of blocks) {
  const month = monthNameToNum(block.monthToken) || h.month;
  const year = Number(block.yearToken) || h.year;
  const parsed = parseCrewRosterBlockV3(Number(block.dayToken), month, year, h.base, block.text);
  textDays.push(...parsed);
 }
 const columnDays = parseServerRosterReportColumnGroups(pages, h);
 const columnFlightCount = columnDays.reduce((sum, day) => sum + (day.legs?.length || 0), 0);
 const textFlightCount = textDays.reduce((sum, day) => sum + (day.legs?.length || 0), 0);
 const days = columnDays.length >= 8 && columnFlightCount >= Math.max(4, textFlightCount * 0.55) ? columnDays : (scoreServerRosterDays(columnDays) >= scoreServerRosterDays(textDays) ? columnDays : textDays);
 return { ...h, days, rawText: fullText, totals: extractTotals(fullText) };
}

function parseServerAims(fullText, pages) {
 const h = parseServerHeader(fullText);
 const days = [];
 for (const page of pages) {
  const markers = page.items.map(item=>({ item, marker: parseAimsDateMarkerServer(item.str, h.month, h.year) })).filter(x=>x.marker);
  if (!markers.length) continue;
  markers.sort((a,b)=>a.item.x-b.item.x);
  const columns = [];
  for (let i=0;i<markers.length;i++) {
   const { item, marker } = markers[i];
   // PDFs de acionamento podem trazer final do mês anterior e início do próximo.
   // Não descartar Jul/May quando o cabeçalho informa Junho; a escala contínua precisa desses dias.
   if (Math.abs(((marker.year || h.year) * 12 + marker.month) - ((h.year || marker.year) * 12 + h.month)) > 1) continue;
   const left = i ? (markers[i-1].item.x + item.x)/2 : item.x - 999;
   const right = i < markers.length-1 ? (item.x + markers[i+1].item.x)/2 : item.x + 999;
   const tokens = page.items.filter(it=>it !== item && it.x >= left && it.x < right && it.y < item.y - 1)
    .sort((a,b)=> b.y-a.y || a.x-b.x)
    .flatMap(it=>String(it.str||'').split(/\s+/))
    .map(t=>t.trim()).filter(Boolean)
    .filter(t=>!ignoreAimsTokenServer(t));
   columns.push({ marker, tokens });
  }
  for (const { marker, tokens } of stitchServerAimsMidnightColumns(columns)) {
   days.push(...parseAimsTokensIntoEventsV3(tokens, marker.day, marker.month, marker.year, h.base));
  }
 }
 return { ...h, days, rawText: fullText, totals: extractTotals(fullText) };
}

/**
 * No AIMS, uma etapa que termina depois da meia-noite pode ser impressa em duas
 * colunas: a origem/saída fica no dia da apresentação e o destino/chegada abre a
 * coluna seguinte. O parser do servidor é o fallback da importação; por isso ele
 * recompõe a etapa antes de interpretar cada dia, sem deslocar a atividade para
 * a data seguinte nem perder a continuidade da jornada.
 */
function stitchServerAimsMidnightColumns(columns) {
 return columns.map((column, index) => {
  const next = columns[index + 1];
  if (!next) return column;
  const tokens = [...column.tokens];
  const upper = tokens.map((token) => String(token || '').toUpperCase());
  let lastLa = -1;
  for (let i = 0; i < upper.length - 1; i++) if (upper[i] === 'LA' && /^\d{3,4}$/.test(upper[i + 1] || '')) lastLa = i;
  if (lastLa < 0) return column;
  const ellipsisIndex = upper.findIndex((token, tokenIndex) => tokenIndex > lastLa + 1 && /^\(\.{3}\)$/.test(token));
  if (ellipsisIndex < 0) return column;

  const nextUpper = next.tokens.map((token) => String(token || '').toUpperCase());
  const nextFirstLa = nextUpper.findIndex((token, tokenIndex) => token === 'LA' && /^\d{3,4}$/.test(nextUpper[tokenIndex + 1] || ''));
  const headLimit = nextFirstLa >= 0 ? nextFirstLa : next.tokens.length;
  const head = next.tokens.slice(0, headLimit);
  if (!head.some((token) => /^\(\.{3}\)$/.test(String(token || '')))) return column;

  const destinationIndex = head.findIndex((token) => isAirportCodeToken(String(token || '').toUpperCase()));
  if (destinationIndex < 0) return column;
  const arrivalIndex = head.findIndex((token, tokenIndex) => tokenIndex > destinationIndex && isTimeToken(token));
  if (arrivalIndex < 0) return column;
  const continuation = [head[destinationIndex], head[arrivalIndex]];
  const debriefIndex = head.findIndex((token, tokenIndex) => tokenIndex > arrivalIndex && isTimeToken(token));
  if (debriefIndex >= 0) continuation.push(head[debriefIndex]);
  tokens.splice(ellipsisIndex, 1, ...continuation);
  return { ...column, tokens };
 });
}

function parseAimsDateMarkerServer(value, baseMonth, baseYear) {
 const m = String(value||'').trim().match(/^(\d{2})(Jan|Feb|Mar|Apr|May|Ma|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Fev|Abr|Mai|Ago|Set|Out|Dez)$/i);
 if (!m) return null;
 const day=Number(m[1]); let month=monthNameToNum(m[2]); if (m[2].toLowerCase()==='ma') month = baseMonth===6 ? 5 : 3;
 let year=baseYear; if (month < baseMonth-6) year++; if (month > baseMonth+6) year--;
 return { day, month, year };
}

function ignoreAimsTokenServer(t) { const u=String(t).toUpperCase(); return !t || ['MON','TUE','WED','THU','FRI','SAT','SUN','SEG','TER','QUA','QUI','SEX','SAB','SÁB','DOM','Y'].includes(u) || /^(TIMEZONE|CONFIRA|TRIPULAÇÕES|TRIPULACOES)/i.test(u) || /^\d{2}(JAN|FEB|MAR|APR|MAY|MA|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/i.test(t); }

function parseAimsFlightSeq(flightNumber, seq) {
 const tokens = seq.map((t) => String(t || '').trim()).filter(Boolean);
 const upper = tokens.map((t) => t.toUpperCase());
 const pattern = findBestFlightPatternV3(tokens);
 if (!pattern) return null;
 const aircraft = upper.find((token) => /^\([A-Z0-9]{3}\)$/.test(token))?.replace(/[()]/g, '') || upper.find((token) => /^(32S|31R|39R|328|319|320|321|32N)$/.test(token)) || undefined;
 const { origin, destination, departureTime, arrivalTime } = pattern;
 const workType = upper.some((token) => ['EXTRA','[EXTRA]','PS','PAX','PASSAGEIRO'].includes(token)) ? 'PS' : 'OP';
 return { flightNumber, origin, destination, departureTime, arrivalTime, workType, aircraftType: aircraft, isNextDay:/\(\+1\)/.test(arrivalTime) || toMin(arrivalTime) < toMin(departureTime), duration: diffHours(departureTime, arrivalTime) };
}

function isTimeToken(t) { return /^\d{1,2}:\d{2}(?:\(\+1\))?$/.test(String(t)); }

function normalizeTimeToken(t) { return String(t).replace(/^([0-9]):/,'0$1:'); }

function diffHours(a,b) { const ma=toMin(a), mb=toMin(b); return ((mb<=ma?mb+1440:mb)-ma)/60; }

function toMin(t) { const [h,m]=normalizeTimeToken(t).replace('(＋1)','').replace('( +1 )','').replace('( +1)','').replace('(+1)','').split(':').map(Number); return h*60+m; }

function extractTotals(fullText) { const m=fullText.match(/FH\s*:\s*(\d{1,3}:\d{2})\s*\|\s*DH\s*:\s*(\d{1,3}:\d{2})/i); return m ? { flightHours: timeToHours(m[1]), dutyHours: timeToHours(m[2]) } : {}; }

function timeToHours(s) { const [h,m]=s.split(':').map(Number); return h + m/60; }

function finalizeServerDays(days, month, year, base) {
 const baseIndex = Number(year) * 12 + Number(month);
 const good = days.filter(d => {
  if (!d || !(d.type !== 'OTHER' || d.legs?.length || d.pairingCode)) return false;
  const itemIndex = Number(d.year) * 12 + Number(d.month);
  return Number.isFinite(itemIndex) && Math.abs(itemIndex - baseIndex) <= 1;
 });
 const byKey = new Map();
 for (const d of good) {
  const legKey = (d.legs || []).map((leg) => `${leg.flightNumber}-${leg.origin}-${leg.destination}-${leg.departureTime}`).join(',');
  const key = `${d.date}|${d.pairingCode || d.type}|${d.dutyReport || ''}|${legKey}`;
  if (!byKey.has(key)) byKey.set(key, d);
 }
 return [...byKey.values()].sort((a,b)=> new Date(a.year,a.month-1,a.dayNumber).getTime()-new Date(b.year,b.month-1,b.dayNumber).getTime() || (toMin(a.dutyReport || '23:59') - toMin(b.dutyReport || '23:59')) || String(a.pairingCode).localeCompare(String(b.pairingCode)));
}

function buildParseDiagnostics(roster, sourceFormat) {
 const days = roster.days || [];
 const uniqueDays = new Set(days.map(d=>d.date)).size;
 const flights = days.reduce((s,d)=>s+(d.legs?.length||0),0);
 const reserve = days.filter((d)=>d.type==='ASB').length;
 const meetings = days.filter((d)=>(d.pairingCode||'')==='MT').length;
 const activities = days.filter(d=>d.pairingCode || d.legs?.length).length;
 const confidence = uniqueDays >= 28 && flights >= 20 && reserve >= 2 ? 'alta' : uniqueDays >= 20 && flights >= 15 ? 'média' : 'baixa';
 return { sourceFormat, uniqueDays, totalEvents: days.length, flights, reserve, meetings, activities, confidence, message: confidence === 'baixa' ? 'Poucos eventos foram lidos; use o modo de reprocessamento ou confira o PDF.' : 'Escala lida com auditoria de servidor: ASB/MT/voos validados.' };
}

export { parsePdfOnServer };
