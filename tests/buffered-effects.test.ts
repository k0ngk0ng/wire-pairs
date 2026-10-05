import { afterEach, describe, expect, it, vi } from 'vitest';
import { BufferedEffects } from '../src/BufferedEffects';
import { loadEffectBank } from '../src/effectBank';
vi.mock('../src/effectBank', () => ({ loadEffectBank: vi.fn(async () => Object.fromEntries(['sel.wav','elec.wav','start.wav','end.wav','itemboom.wav'].map(f => [f,'AA==']))) }));
class Context {
  static instance: Context;
  state = 'suspended'; destination = {};
  sources: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; onended?: () => void }[] = [];
  constructor() { Context.instance = this; }
  decodeAudioData = vi.fn(async () => ({}));
  resume = vi.fn(async () => { this.state = 'running'; });
  createGain() { return { gain:{value:1},connect:vi.fn(),disconnect:vi.fn() }; }
  createBufferSource() { const s={start:vi.fn(),stop:vi.fn(),connect:vi.fn(() => ({ connect:vi.fn() })),disconnect:vi.fn()}; this.sources.push(s);return s; }
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.useRealTimers(); });
describe('predecoded, latest-only effects', () => {
  it('decodes once, starts synchronously, and replaces every prior sound', async () => {
    vi.stubGlobal('AudioContext',Context); const audio=new BufferedEffects();
    await audio.preload(); const context=Context.instance;
    expect(context.sources).toHaveLength(0); // Preloading cannot play sound.
    audio.unlock(); expect(audio.play('sel.wav',.6)).toBe(true);
    expect(context.sources[0].start).toHaveBeenCalledTimes(1);
    for(let i=0;i<100;i++) audio.play(i%2?'sel.wav':'elec.wav',.6);
    expect(context.sources.slice(0,-1).every(s=>s.stop.mock.calls.length===1)).toBe(true);
    expect(context.sources.at(-1)!.stop).not.toHaveBeenCalled();
    expect(loadEffectBank).toHaveBeenCalledTimes(1); expect(context.decodeAudioData).toHaveBeenCalledTimes(5);
    audio.stop(); expect(context.sources.at(-1)!.stop).toHaveBeenCalledTimes(1);
  });
  it('never queues stale sounds while decoding and resumes an interrupted context', async () => {
    vi.stubGlobal('AudioContext',Context); const audio=new BufferedEffects();
    const loading=audio.preload(); audio.unlock(); expect(audio.play('elec.wav',.6)).toBe(false);
    await loading; expect(Context.instance.sources).toHaveLength(0);
    Context.instance.state='interrupted'; audio.unlock(); expect(Context.instance.state).toBe('running');
    expect(audio.play('elec.wav',.6)).toBe(true);
  });
  it('recovers a delayed victory without another gesture and reports natural completion', async () => {
    vi.stubGlobal('AudioContext', Context); const audio = new BufferedEffects();
    await audio.preload(); const context = Context.instance;
    context.state = 'interrupted'; const ended = vi.fn(), fallback = vi.fn();
    expect(audio.play('end.wav', .6, ended, fallback)).toBe(true);
    await Promise.resolve();
    expect(context.sources).toHaveLength(1); expect(context.resume).toHaveBeenCalledTimes(1);
    context.sources[0].onended!(); expect(ended).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
  });
  it('falls back on rejected or stalled resume, without replaying replaced sounds', async () => {
    vi.useFakeTimers(); vi.stubGlobal('AudioContext', Context); const audio = new BufferedEffects();
    await audio.preload(); const context = Context.instance;
    context.resume.mockRejectedValueOnce(new Error('interrupted'));
    const fallback = vi.fn(); audio.play('end.wav', .6, undefined, fallback);
    await Promise.resolve(); await Promise.resolve(); expect(fallback).toHaveBeenCalledOnce();
    let resume!: () => void;
    context.resume.mockImplementation(() => new Promise<void>(resolve => { resume = resolve; }));
    fallback.mockClear(); audio.play('end.wav', .6, undefined, fallback);
    await vi.advanceTimersByTimeAsync(500); expect(fallback).toHaveBeenCalledOnce();
    context.state = 'running'; resume(); await Promise.resolve(); expect(context.sources).toHaveLength(0);
    context.state = 'interrupted'; fallback.mockClear();
    audio.play('end.wav', .6, undefined, fallback); audio.stop();
    await vi.advanceTimersByTimeAsync(500); expect(fallback).not.toHaveBeenCalled();
    context.state = 'running'; resume(); await Promise.resolve(); expect(context.sources).toHaveLength(0);
  });
  it('does not let a replaced victory stop the next level music', async () => {
    vi.stubGlobal('AudioContext', Context); const audio = new BufferedEffects();
    await audio.preload(); audio.unlock(); const ended = vi.fn();
    audio.play('end.wav', .6, ended); const victory = Context.instance.sources[0];
    audio.play('start.wav', .6); victory.onended!(); expect(ended).not.toHaveBeenCalled();
  });

});
