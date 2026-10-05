import { assetUrl } from './assets';
import { BufferedEffects } from './BufferedEffects';
const ASSETS = assetUrl('audio/');
export type AudioSettings = { muted: boolean; effects: number; music: number; reduced: boolean };
export const defaultSettings: AudioSettings = { muted: false, effects: .6, music: .15, reduced: false };
type Voice = { element: HTMLAudioElement; revision: number; unlocked: boolean; priming: boolean };
const files: Record<string, string> = { select: 'sel.wav', match: 'elec.wav', won: 'end.wav', lost: 'end.wav', start: 'start.wav', break: 'itemboom.wav', shuffle: 'itemboom.wav', hint: 'sel.wav', countdown: 'sel.wav', error: 'sel.wav' };
export class GameAudio {
  private effects = new BufferedEffects();
  preload() { void this.effects.preload(); }
  private voices = new Map<string, Voice[]>();
  private music: Voice | null = null;
  private playing = false;
  settings = defaultSettings;
  private create(file: string): Voice {
    const element = new Audio(ASSETS + file);
    element.preload = 'auto';
    return { element, revision: 0, unlocked: false, priming: false };
  }
  private prepare() {
    if (this.music) return;
    this.music = this.create('bg-legacy-2015.mp3'); this.music.element.loop = true;
    for (const [file, count] of [['sel.wav', 1], ['elec.wav', 1], ['start.wav', 1], ['end.wav', 1], ['itemboom.wav', 1]] as const)
      this.voices.set(file, Array.from({ length: count }, () => this.create(file)));
  }
  // Reuse a small, fixed pool. Mobile Safari requires each media element to be
  // authorized by a user gesture; creating a new element for every match loses that authorization.
  unlock() {
    if (this.settings.muted) return;
    this.prepare();
    this.effects.unlock();
    for (const voice of [this.music!, ...[...this.voices.values()].flat()]) {
      if (voice.unlocked || voice.priming) continue;
      if (voice.element.error) voice.element.load();
      const revision = ++voice.revision;
      voice.priming = true; voice.element.muted = true;
      void voice.element.play().then(() => { voice.unlocked = true; }).catch(() => { voice.unlocked = false; }).finally(() => {
        voice.priming = false;
        // An actual game sound may have claimed the voice while priming was pending.
        if (voice.revision === revision) { voice.element.pause(); voice.element.currentTime = 0; voice.element.muted = false; }
      });
    }
    if (this.playing && this.settings.music > 0 && (this.music!.element.paused || this.music!.priming))
      this.start(this.music!, this.settings.music, false);
  }
  private start(voice: Voice, volume: number, rewind: boolean, onEnded?: () => void) {
    const revision = ++voice.revision;
    voice.element.onended = () => { if (voice.revision === revision) onEnded?.(); };
    voice.element.muted = false; voice.element.volume = volume;
    if (rewind) voice.element.currentTime = 0;
    void voice.element.play().then(() => { voice.unlocked = true; }).catch(() => {
      if (voice.revision === revision) {
        voice.unlocked = false; // Retry authorization on the next gesture.
        onEnded?.();
      }
    });
  }
  private pauseMusic() {
    if (this.music) { ++this.music.revision; this.music.element.pause(); }
  }
  play(type: string) {
    if (this.settings.muted || !this.settings.effects || !files[type]) {
      if (type === 'won' || type === 'lost') this.pauseMusic();
      return;
    }
    for (const voice of [...this.voices.values()].flat()) { ++voice.revision; voice.element.pause(); }
    const volume = this.settings.effects * (type === 'select' ? .65 : .8);
    const onEnded = type === 'won' || type === 'lost' ? () => { if (!this.playing) this.pauseMusic(); } : undefined;
    const fallback = () => {
      this.prepare();
      const voice = this.voices.get(files[type])![0];
      this.start(voice, volume, true, onEnded);
    };
    if (!this.effects.play(files[type], volume, onEnded, fallback)) fallback();
  }
  configure(settings: AudioSettings, playing: boolean, finishing = false) {
    this.settings = settings; this.playing = playing;
    const stopEffects = settings.muted || (!playing && !finishing) || !settings.effects;
    if (stopEffects) this.effects.stop();
    if (playing && !settings.muted) this.prepare();
    if (this.music) {
      this.music.element.volume = settings.music;
      if (playing && !settings.muted && settings.music > 0) this.start(this.music, settings.music, false);
      else if (!finishing || settings.muted || !settings.effects || !settings.music) this.pauseMusic();
    }
    for (const voice of [...this.voices.values()].flat()) {
      if (stopEffects) { ++voice.revision; voice.element.pause(); }
      else voice.element.volume = settings.effects * .8;
    }
  }
}
export const audio = new GameAudio();
