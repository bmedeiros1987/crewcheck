const clean = (value, max = 160) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const fold = value => clean(value, 600).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const flight = value => clean(value, 24).replace(/\s+/g, '').toUpperCase().replace(/^LAN(?=\d)/, 'LA').replace(/^TAM(?=\d)/, 'JJ');
export function radarCivilDate(value) {
  const text = clean(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const date = new Date(text + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : '';
}
export function radarReadIntent(text = '') {
  const normalized = fold(text), original = clean(text, 600);
  // Gate/terminal words in corporate ground transport are not flight queries.
  const radarCommand = /^\/(?:radar|portao|portão)(?:@\w+)?(?:\s|$)/.test(normalized);
  if (!radarCommand && /\b(?:onibus|van|vans|transporte)\b/.test(normalized) && /\b(?:empresa|corporativo|corporativa)\b/.test(normalized)) return null;
  if (/^(?:\/voos_seguidos(?:@\w+)?|(?:meus )?voos (?:seguidos|que sigo)|voo que (?:eu )?sigo)[?.!]*$/.test(normalized)) return { kind: 'followed' };
  const withoutDates = original.replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{2}\/\d{2}\/\d{4}\b/g, '');
  const numbers = [...withoutDates.toUpperCase().matchAll(/\b((?:[A-Z]{2,3}|[A-Z][0-9]|[0-9][A-Z]))\s*[- ]?(\d{1,6})\b/g)].filter(match => !['VOO','DIA'].includes(match[1]));
  const number = numbers[0];
  const aviationTopic = /\bradar\b/.test(normalized) || ((number || /\bvoo\b/.test(normalized)) && /\b(?:portao|gate|terminal)\b/.test(normalized)) || (/\bvoo\b/.test(normalized) && /\b(?:status|atraso|atrasou|cancelado|informacoes|informacao|chegada|partida)\b/.test(normalized));
  if (!/^(?:\/radar|\/portao|\/portão)(?:@\w+)?(?:\s|$)/.test(normalized) && !aviationTopic && !(number && /\b(?:voo|status|atraso|chegada|partida)\b/.test(normalized))) return null;
  const iso = original.match(/\b(\d{4}-\d{2}-\d{2})\b/), br = original.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  const date = radarCivilDate(iso?.[1] || (br ? `${br[3]}-${br[2]}-${br[1]}` : ''));
  return { kind: 'flight', flight: number ? flight(number[1] + number[2]) : '', date, invalidDate: Boolean((iso || br) && !date), ambiguous: new Set(numbers.map(match=>flight(match[1]+match[2]))).size > 1 || [...original.matchAll(/\b\d{4}-\d{2}-\d{2}\b|\b\d{2}\/\d{2}\/\d{4}\b/g)].length > 1 };
}
