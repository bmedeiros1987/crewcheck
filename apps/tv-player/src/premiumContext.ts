import { freshness, type TvSnapshot, type TvWeatherContext } from '../../../packages/tv-core/src/index';

export type AirlineTheme = 'latam' | 'gol' | 'azul' | 'generic';

export function airlineTheme(value: unknown): AirlineTheme {
  const text=String(value||'').trim().toUpperCase();
  if (/\bLATAM\b|\bLAN\b|\bTAM\b/.test(text)) return 'latam';
  if (/\bGOL\b/.test(text)) return 'gol';
  if (/\bAZUL\b/.test(text)) return 'azul';
  return 'generic';
}

export function currentWeatherContexts(snapshot: TvSnapshot | null, now=Date.now()): TvWeatherContext[] {
  if (!snapshot || !Array.isArray(snapshot.weatherContexts)) return [];
  return snapshot.weatherContexts.filter(item =>
    item && typeof item.airport==='string' && /^[A-Z]{3}$/.test(item.airport) &&
    Number.isFinite(item.temperature) && typeof item.source==='string' && item.source &&
    freshness({generatedAt:item.observedAt,expiresAt:item.expiresAt},now)==='current'
  );
}

export function weatherFor(snapshot: TvSnapshot | null, role: 'base'|'stay', now=Date.now()): TvWeatherContext | null {
  return currentWeatherContexts(snapshot,now).find(item=>item.role===role)||null;
}
