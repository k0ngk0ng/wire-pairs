import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameAudio, defaultSettings } from '../src/audio';

class Media {
  static all: Media[] = [];
  paused = true; muted = false; volume = 1; currentTime = 0; loop = false; preload = ''; error = null;
  rejectNext = false;
  play = vi.fn(() => { if (this.rejectNext) { this.rejectNext = false; return Promise.reject(new DOMException('blocked', 'NotAllowedError')); } this.paused = false; return Promise.resolve(); });
  pause = vi.fn(() => { this.paused = true; });
  load = vi.fn();
  constructor(public src: string) { Media.all.push(this); }
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
afterEach(() => { vi.unstubAllGlobals(); Media.all = []; });
describe('mobile audio lifecycle', () => {
  it('reuses authorized players across five stages and many neighboring matches', async () => {
    vi.stubGlobal('Audio', Media); const audio = new GameAudio();
    audio.unlock(); audio.configure(defaultSettings, true); audio.play('match');
    await settle();
    expect(Media.all.find(v => v.src.endsWith('elec.wav'))!.paused).toBe(false);
    for (let level = 1; level <= 5; level++) {
      audio.unlock(); audio.configure(defaultSettings, true);
      for (let pair = 0; pair < 50; pair++) { audio.play('select'); audio.play('match'); }
      audio.configure(defaultSettings, false); audio.play('won'); await settle();
    }
    expect(Media.all).toHaveLength(6);
    expect(Media.all.filter(v => v.src.endsWith('elec.wav')).reduce((n, v) => n + v.play.mock.calls.length, 0)).toBeGreaterThanOrEqual(250);
    audio.configure(defaultSettings, true); await settle();
    expect(Media.all.find(v => v.loop)!.paused).toBe(false);
  });
  it('replaces an unfinished effect without interrupting background music', async () => {
    vi.stubGlobal('Audio', Media); const audio = new GameAudio();
    audio.unlock(); audio.configure(defaultSettings, true); await settle();
    audio.play('match'); const match = Media.all.find(v => v.src.endsWith('elec.wav'))!;
    expect(match.paused).toBe(false);
    audio.play('select'); expect(match.paused).toBe(true);
    const select = Media.all.find(v => v.src.endsWith('sel.wav'))!;
    expect(select.paused).toBe(false);
    select.currentTime = .03; audio.play('select'); expect(select.currentTime).toBe(0);
    expect(Media.all.filter(v => !v.loop && !v.paused)).toHaveLength(1);
    expect(Media.all.find(v => v.loop)!.paused).toBe(false);
  });
  it('recovers rejected background playback on the next user gesture', async () => {
    vi.stubGlobal('Audio', Media); const audio = new GameAudio();
    audio.unlock(); await settle();
    const music = Media.all.find(v => v.loop)!; music.rejectNext = true;
    audio.configure(defaultSettings, true); await settle(); expect(music.paused).toBe(true);
    audio.unlock(); await settle(); expect(music.paused).toBe(false);
    audio.configure({ ...defaultSettings, muted: true }, true); expect(Media.all.every(v => v.paused)).toBe(true);
    audio.play('match'); audio.unlock(); expect(Media.all.every(v => v.paused)).toBe(true);
  });
});
