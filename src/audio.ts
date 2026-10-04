import { assetUrl } from './assets';
const ASSETS = assetUrl('audio/');
export type AudioSettings = { muted: boolean; effects: number; music: number; reduced: boolean };
export const defaultSettings: AudioSettings = { muted: false, effects: .6, music: .15, reduced: false };
class GameAudio {
  private context: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<AudioBuffer | null>>();
  private active: AudioBufferSourceNode[] = [];
  private nativeActive: HTMLAudioElement[] = [];
  private nativeEffects = new URL(ASSETS, location.href).origin !== location.origin;
  private music: HTMLAudioElement | null = null;
  settings = defaultSettings;
  async unlock() {
    if (this.nativeEffects) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') await this.context.resume();
      for (const file of ['sel.wav', 'elec.wav', 'start.wav', 'end.wav', 'itemboom.wav']) void this.load(file);
    } catch { /* Silent play remains available on devices without audio support. */ }
  }
  private load(file: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(file)) return Promise.resolve(this.buffers.get(file)!);
    if (this.pending.has(file)) return this.pending.get(file)!;
    const pending = fetch(ASSETS + file).then(r => { if (!r.ok) throw new Error('audio'); return r.arrayBuffer(); })
      .then(data => this.context!.decodeAudioData(data)).then(buffer => { this.buffers.set(file, buffer); return buffer; }).catch(() => null);
    this.pending.set(file, pending); return pending;
  }
  async play(type: string) {
    if (this.settings.muted || !this.settings.effects) return;
    const file = ({ select: 'sel.wav', match: 'elec.wav', won: 'end.wav', lost: 'end.wav', start: 'start.wav', break: 'itemboom.wav', shuffle: 'itemboom.wav', hint: 'sel.wav', countdown: 'sel.wav', error: 'sel.wav' } as Record<string, string>)[type];
    if (!file) return;
    // Ordinary media playback supports CDN resources without CORS access to samples.
    if (this.nativeEffects) {
      while (this.nativeActive.length >= 5) this.nativeActive.shift()!.pause();
      const sound = new Audio(ASSETS + file);
      sound.volume = this.settings.effects * (type === 'select' ? .65 : .8);
      const remove = () => { this.nativeActive = this.nativeActive.filter(n => n !== sound); };
      sound.onended = remove; sound.onerror = remove;
      this.nativeActive.push(sound);
      await sound.play().catch(remove);
      return;
    }
    if (!this.context) return;
    const buffer = await this.load(file);
    if (!buffer || !this.context || this.settings.muted) return;
    while (this.active.length >= 5) { try { this.active.shift()!.stop(); } catch { /* Already ended. */ } }
    const source = this.context.createBufferSource(), gain = this.context.createGain();
    source.buffer = buffer; gain.gain.value = this.settings.effects * (type === 'select' ? .65 : .8);
    source.connect(gain).connect(this.context.destination); this.active.push(source);
    source.onended = () => { this.active = this.active.filter(n => n !== source); source.disconnect(); gain.disconnect(); };
    source.start();
  }
  configure(settings: AudioSettings, playing: boolean) {
    this.settings = settings;
    if (!this.music && playing) { this.music = new Audio(ASSETS + 'bg.mp3'); this.music.loop = true; }
    if (this.music) { this.music.volume = settings.muted ? 0 : settings.music; if (playing && !settings.muted && settings.music > 0) void this.music.play().catch(() => {}); else this.music.pause(); }
    if (settings.muted || !playing) { for (const sound of this.nativeActive) sound.pause(); this.nativeActive = []; for (const source of this.active) { try { source.stop(); } catch { /* Already ended. */ } } this.active = []; }
  }
}
export const audio = new GameAudio();
