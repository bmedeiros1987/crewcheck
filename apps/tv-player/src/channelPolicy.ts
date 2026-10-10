export type ChannelView = 'Meteorologia' | 'Radar' | 'Apresentação' | 'Pernoite' | 'Agora' | 'Semana' | 'Mês' | 'Mudanças' | 'Notícias';
export const CHANNEL_INTERVALS = [20, 30, 45, 60] as const;
export const READING_PAUSE_MS = 60000;
export function channelInterval(value: unknown): number {
  const n = Number(value);
  return CHANNEL_INTERVALS.includes(n as any) ? n : 30;
}
export function channelDeck(
  hasSnapshot: boolean,
  hasChanges: boolean,
  hasNews: boolean,
  quick?: {presentation:boolean;weather:boolean;radar:boolean;stay:boolean},
): ChannelView[] {
  if (!hasSnapshot) return [];
  if (quick) return [
    'Agora',
    'Mês',
    ...(quick.presentation ? ['Apresentação' as const] : []),
    ...(quick.weather ? ['Meteorologia' as const] : []),
    ...(quick.radar ? ['Radar' as const] : []),
    ...(quick.stay ? ['Pernoite' as const] : []),
    ...(hasChanges ? ['Mudanças' as const] : []),
    ...(hasNews ? ['Notícias' as const] : []),
  ];
  return ['Agora', 'Semana', 'Mês', ...(hasChanges ? ['Mudanças' as const] : []), ...(hasNews ? ['Notícias' as const] : [])];
}
export function nextChannelView(current: string, deck: ChannelView[]): ChannelView | null {
  if (deck.length < 2) return null;
  const index = deck.indexOf(current as ChannelView);
  return deck[(index + 1) % deck.length];
}
export class RotationClock {
  remaining = 30000;
  hold = 0;
  private duration = 30000;
  configure(seconds: number) { this.duration = channelInterval(seconds) * 1000; this.remaining = this.duration; }
  interact() { this.hold = READING_PAUSE_MS; this.remaining = this.duration; }
  resume() { this.hold = 0; this.remaining = this.duration; }
  step(delta: number, allowed: boolean): boolean {
    const elapsed = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 2000)) : 0;
    if (!allowed) { this.remaining = this.duration; return false; }
    if (this.hold > 0) { this.hold = Math.max(0, this.hold - elapsed); return false; }
    this.remaining -= elapsed;
    if (this.remaining > 0) return false;
    this.remaining = this.duration; return true;
  }
}
