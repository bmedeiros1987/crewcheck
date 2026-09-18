// Presentation only: these helpers never calculate APZ, flight status or weather.
export type WeatherArt = 'sun' | 'partly' | 'cloud' | 'rain' | 'storm' | 'snow' | 'fog' | 'wind' | 'unknown';
export function weatherArt(label?: string | null): WeatherArt {
  const text = String(label || '').toLowerCase().trim();
  if (!text || /indispon|aguard|unknown|unavailable|sem dados|nao informado|não informado/.test(text)) return 'unknown';
  // A supplied condition is only mapped to an illustration. Do not infer weather
  // from temperature, airport, time of day or a missing provider response.
  if (/trovoad|tempestade|thunderstorm/.test(text)) return 'storm';
  if (/neve|snow/.test(text)) return 'snow';
  if (/nevoeiro|neblina|fog|mist/.test(text)) return 'fog';
  if (!/sem chuva|no rain/.test(text) && /chuva|garoa|rain|drizzle|shower/.test(text)) return 'rain';
  if (/parcialmente nublado|poucas nuvens|partly cloudy|partly sunny|few clouds/.test(text)) return 'partly';
  if (/nublado|encoberto|cloudy|overcast/.test(text)) return 'cloud';
  if (/céu limpo|ceu limpo|ensolarado|clear sky|sunny/.test(text)) return 'sun';
  if (/ventoso|windy/.test(text)) return 'wind';
  return 'unknown';
}
export function formatTvTime(value?: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '—';
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}
export function formatMonth(month: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return 'Escala';
  const names = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return names[Number(month.slice(5)) - 1] + ' ' + month.slice(0, 4);
}
export function activityLabel(a?: { kind: string; flight?: string | null; publishedCode?: string } | null): string {
  if (!a) return 'Sem programação';
  if (a.kind === 'flight') return a.flight || 'Voo';
  const code = String(a.publishedCode || '').toUpperCase();
  if (['DO', 'DOF', 'OFF'].includes(code)) return 'Folga';
  if (['HSB', 'HSBE'].includes(code)) return 'Sobreaviso';
  if (['ASB', 'RES'].includes(code)) return 'Reserva';
  if (code === 'CRM') return 'Treinamento';
  if (a.kind === 'stay') return 'Pernoite';
  if (a.kind === 'journey-rest') return 'Repouso';
  if (a.kind === 'rest') return 'Descanso';
  return 'Programação';
}
export function readVisualSetting(key: string, allowed: string[], fallback: string): string {
  try { const value = localStorage.getItem(key); return value && allowed.includes(value) ? value : fallback; }
  catch { return fallback; }
}
export function writeVisualSetting(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* Preferences must never prevent boot. */ }
}
