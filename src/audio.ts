import { assetUrl } from './assets';
const ASSETS = assetUrl('audio/');
export type AudioSettings = { muted: boolean; effects: number; music: number; reduced: boolean };
export const defaultSettings: AudioSettings = { muted: false, effects: .6, music: .15, reduced: false };
type Voice = { element: HTMLAudioElement; revision: number; unlocked: boolean; priming: boolean };
const files: Record<string, string> = { select: 'sel.wav', match: 'elec.wav', won: 'end.wav', lost: 'end.wav', start: 'start.wav', break: 'itemboom.wav', shuffle: 'itemboom.wav', hint: 'sel.wav', countdown: 'sel.wav', error: 'sel.wav' };
export class GameAudio {
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
    this.music = this.create('bg.mp3'); this.music.element.loop = true;
    for (const [file, count] of [['sel.wav', 2], ['elec.wav', 3], ['start.wav', 1], ['end.wav', 1], ['itemboom.wav', 1]] as const)
      this.voices.set(file, Array.from({ length: count }, () => this.create(file)));
  }
  // Reuse a small, fixed pool. Mobile Safari requires each media element to be
  // authorized by a user gesture; creating a new element for every match loses that authorization.
  unlock() {
    if (this.settings.muted) return;
    this.prepare();
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
  private start(voice: Voice, volume: number, rewind: boolean) {
    const revision = ++voice.revision;
    voice.element.muted = false; voice.element.volume = volume;
    if (rewind) voice.element.currentTime = 0;
    void voice.element.play().then(() => { voice.unlocked = true; }).catch(() => {
      if (voice.revision === revision) voice.unlocked = false; // Retry authorization on the next gesture.
    });
  }
  play(type: string) {
    if (this.settings.muted || !this.settings.effects || !files[type]) return;
    this.prepare();
    const pool = this.voices.get(files[type])!;
    const voice = pool.find(v => v.element.paused && !v.priming) || pool[0];
    pool.splice(pool.indexOf(voice), 1); pool.push(voice);
    this.start(voice, this.settings.effects * (type === 'select' ? .65 : .8), true);
  }
  configure(settings: AudioSettings, playing: boolean) {
    this.settings = settings; this.playing = playing;
    if (playing && !settings.muted) this.prepare();
    if (this.music) {
      this.music.element.volume = settings.music;
      if (playing && !settings.muted && settings.music > 0) this.start(this.music, settings.music, false);
      else { ++this.music.revision; this.music.element.pause(); }
    }
    for (const voice of [...this.voices.values()].flat()) {
      if (settings.muted || !playing || !settings.effects) { ++voice.revision; voice.element.pause(); }
      else voice.element.volume = settings.effects * .8;
    }
  }
}
export const audio = new GameAudio();
