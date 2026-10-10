export const CREW_TRACKS = [
  { id: 'theme', title: 'CrewCheck Theme', src: 'music/crewcheck-theme.mp3' },
  { id: 'suite', title: 'CrewCheck Suite', src: 'music/crewcheck-suite.mp3' },
  { id: 'clear', title: 'Clear for Flight', src: 'music/clear-for-flight.mp3' },
  { id: 'ascent', title: 'Effortless Ascent', src: 'music/effortless-ascent.mp3' },
] as const;
export type SoundStatus = 'off' | 'starting' | 'playing' | 'paused' | 'suspended' | 'blocked' | 'error';
export type SoundState = { index: number; volume: number; status: SoundStatus; wanted: boolean; diagnostic?: string };
export type AudioPort = Pick<HTMLAudioElement, 'src' | 'volume' | 'preload' | 'currentTime' | 'paused' | 'error' | 'play' | 'pause' | 'load' | 'addEventListener' | 'removeEventListener'> & { canPlayType?: (type:string)=>string };
export function musicVolume(value: unknown): number {
  const n = value === null || value === '' ? NaN : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 22;
}
export function musicIndex(value: unknown): number {
  const n = Number(value); return Number.isInteger(n) && n >= 0 && n < CREW_TRACKS.length ? n : 0;
}
// webOS: exactly one HTML audio decoder. No overlapping players or Web Audio.
export class CrewSoundtrack {
  state: SoundState;
  private available = false;
  private suspended = true;
  private disposed = false;
  private epoch = 0;
  private loadedIndex = -1;
  private failures = new Set<number>();
  private fade: ReturnType<typeof setInterval> | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  constructor(private audio: AudioPort, private notify: (state: SoundState) => void, index = 0, volume = 15) {
    this.state = {index: musicIndex(index), volume: musicVolume(volume), status: 'off', wanted: false, diagnostic: undefined};
    audio.preload = 'metadata'; audio.volume = 0;
    audio.addEventListener('playing', this.playing);
    audio.addEventListener('ended', this.ended);
    audio.addEventListener('error', this.failed);
  }
  private emit(status?: SoundStatus, diagnostic?: string) {
    if (status) this.state.status = status;
    if (diagnostic !== undefined) this.state.diagnostic = diagnostic || undefined;
    if (!this.disposed) this.notify({...this.state});
  }
  private clearTimers() {
    if (this.fade) clearInterval(this.fade);
    if (this.watchdog) clearTimeout(this.watchdog);
    this.fade = null; this.watchdog = null;
  }
  private quiet() { this.epoch++; this.clearTimers(); this.audio.pause(); this.audio.volume = 0; }
  setContext(available: boolean, suspended: boolean) {
    const wasSuspended = this.suspended;
    this.available = available; this.suspended = suspended;
    if (!available) { if (this.state.wanted || this.state.status !== 'off') this.stop(); return; }
    if (suspended) {
      if (this.state.wanted && this.state.status !== 'suspended') { this.quiet(); this.emit('suspended'); }
    } else if (wasSuspended && this.state.wanted) this.request();
  }
  start() {
    if (this.disposed || !this.available) return;
    this.failures.clear(); this.state.wanted = true; this.request();
  }
  pause() { this.state.wanted = false; this.quiet(); this.emit('paused'); }
  stop() { this.state.wanted = false; this.quiet(); this.emit('off'); }
  toggle() {
    if (this.state.wanted && ['playing','starting','suspended'].includes(this.state.status)) this.pause();
    else this.start();
  }
  select(index: number, start = true) {
    this.quiet(); this.state.index = musicIndex(index); this.loadedIndex = -1;
    if (start) this.start(); else this.emit(this.state.wanted ? 'suspended' : 'paused');
  }
  move(direction: number) {
    const index = (this.state.index + direction + CREW_TRACKS.length) % CREW_TRACKS.length;
    const resume = this.state.wanted;
    this.select(index, false); if (resume) this.request();
  }
  setVolume(value: number) {
    this.state.volume = musicVolume(value);
    if (this.fade) { clearInterval(this.fade); this.fade = null; }
    this.audio.volume = this.state.status === 'playing' ? this.state.volume / 100 : 0;
    this.emit();
  }
  private request() {
    if (this.disposed || !this.state.wanted || !this.available) return;
    if (this.suspended) { this.emit('suspended'); return; }
    this.clearTimers(); const epoch = ++this.epoch;
    if (typeof this.audio.canPlayType === 'function' && this.audio.canPlayType('audio/mpeg') === '') {
      this.state.wanted = false; this.quiet(); this.emit('error','TV-AUDIO-CODEC'); return;
    }
    if (this.loadedIndex !== this.state.index) {
      // webOS resolves packaged media relative to index.html. Keep a simple
      // app-relative path so the hardware decoder sees a normal local MP3 URI.
      this.audio.src = CREW_TRACKS[this.state.index].src;
      this.audio.preload = 'auto';
      this.loadedIndex = this.state.index; this.audio.load();
    }
    this.audio.volume = 0; this.emit('starting','');
    this.watchdog = setTimeout(() => {
      if (epoch === this.epoch && this.state.status === 'starting') {
        this.state.wanted = false; this.quiet(); this.emit('blocked','TV-AUDIO-TIMEOUT');
      }
    }, 8000);
    try {
      const result = this.audio.play();
      if (result && typeof result.then === 'function') result.catch(error => {
        if (epoch !== this.epoch || this.disposed) return;
        if (error && error.name === 'NotAllowedError') {
          this.state.wanted = false; this.quiet(); this.emit('blocked','TV-AUDIO-POLICY');
        } else this.failed();
      });
    } catch { this.failed(); }
  }
  private playing = () => {
    if (this.disposed || !this.state.wanted || !this.available || this.suspended) { this.quiet(); return; }
    this.clearTimers(); this.failures.clear(); this.emit('playing','');
    // Short sequential fade-in, not a two-decoder crossfade.
    let step = 0;
    this.fade = setInterval(() => {
      step++; this.audio.volume = this.state.volume / 100 * Math.min(1, step / 10);
      if (step >= 10 && this.fade) { clearInterval(this.fade); this.fade = null; }
    }, 60);
  };
  private ended = () => { if (this.state.wanted && !this.suspended && this.available) this.move(1); };
  private failed = () => {
    if (this.disposed || !this.state.wanted || this.suspended) return;
    this.quiet(); this.failures.add(this.state.index);
    if (this.failures.size >= CREW_TRACKS.length) { this.state.wanted = false; this.emit('error','TV-AUDIO-LOAD'); return; }
    let next = (this.state.index + 1) % CREW_TRACKS.length;
    while (this.failures.has(next)) next = (next + 1) % CREW_TRACKS.length;
    this.state.index = next; this.loadedIndex = -1; this.request();
  };
  dispose() {
    this.stop(); this.disposed = true;
    this.audio.removeEventListener('playing', this.playing);
    this.audio.removeEventListener('ended', this.ended);
    this.audio.removeEventListener('error', this.failed);
  }
}
