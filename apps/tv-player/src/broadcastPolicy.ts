import type { TvActivity, TvSnapshot } from '../../../packages/tv-core/src/index';
import { currentFact } from '../../../packages/tv-core/src/index';

export type QuickView = 'Agora' | 'Meteorologia' | 'Radar' | 'Apresentação' | 'Pernoite';
// Presentation-only filtering of already-canonical stays; never infer a hotel,
// a journey boundary, a day off or a new published report time.
export function upcomingStay(snapshot: TvSnapshot | null, now = Date.now()): TvActivity | null {
  if (!snapshot || !Number.isFinite(now)) return null;
  const stays = snapshot.days.reduce<TvActivity[]>((all, day) => all.concat(day.activities.filter(a =>
    a.kind === 'stay' && Number.isFinite(Date.parse(a.startAt)) && Date.parse(a.endAt) > now)), []);
  return stays.sort((a,b) => Date.parse(a.startAt)-Date.parse(b.startAt))[0] || null;
}
export function countdown(activity: TvActivity | null | undefined, now: number): string {
  if (!activity || !Number.isFinite(now) || !Number.isFinite(Date.parse(activity.startAt))) return 'Não informado';
  const minutes = Math.ceil((Date.parse(activity.startAt)-now)/60000);
  if (minutes <= 0) return Date.parse(activity.endAt) > now ? 'Em andamento' : 'Consulte a escala';
  const days=Math.floor(minutes/1440), hours=Math.floor((minutes%1440)/60), remainder=minutes%60;
  return (days ? days+'d ' : '')+(hours ? hours+'h ' : '')+remainder+'min';
}
export function isCiriumSource(source: string | undefined): boolean {
  return typeof source === 'string' && /^cirium(?:$|[:/\s-])/i.test(source.trim());
}
export function quickAvailability(snapshot: TvSnapshot | null, now=Date.now()) {
  return {
    presentation: Boolean(snapshot?.next),
    weather: Boolean(currentFact(snapshot?.weather || null,now)),
    radar: Boolean(currentFact(snapshot?.gate || null,now)),
    stay: Boolean(upcomingStay(snapshot,now)),
  };
}
