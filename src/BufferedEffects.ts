import { loadEffectBank } from './effectBank';
export class BufferedEffects {
  private context: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private active = new Set<AudioBufferSourceNode>();
  private loading: Promise<void> | null = null;
  private retryAt = 0;
  get ready() { return this.buffers.size === 5 && this.context?.state === 'running'; }
  preload() {
    if (this.loading || this.buffers.size === 5 || Date.now() < this.retryAt) return this.loading;
    try {
      if (typeof AudioContext === 'undefined') return null;
      this.context ??= new AudioContext({ latencyHint: 'interactive' });
      const context = this.context;
      this.loading = loadEffectBank().then(async bank => {
        const decoded = await Promise.all(['sel.wav', 'elec.wav', 'start.wav', 'end.wav', 'itemboom.wav'].map(async file => {
          const data = Uint8Array.from(atob(bank[file]), c => c.charCodeAt(0));
          return [file, await context.decodeAudioData(data.buffer)] as const;
        }));
        this.buffers = new Map(decoded);
      }).catch(() => { this.retryAt = Date.now() + 10000; }).finally(() => { this.loading = null; });
    } catch { this.retryAt = Date.now() + 10000; }
    return this.loading;
  }
  unlock() {
    void this.preload();
    // Safari can interrupt an existing context after an app switch or phone call.
    if (this.context && this.context.state !== 'running' && this.context.state !== 'closed') void this.context.resume().catch(() => {});
  }
  play(file: string, volume: number) {
    this.stop();
    const buffer = this.buffers.get(file), context = this.context;
    if (!buffer || !context || context.state !== 'running') return false;
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer; gain.gain.value = volume;
    source.connect(gain).connect(context.destination);
    this.active.add(source);
    source.onended = () => { this.active.delete(source); source.disconnect(); gain.disconnect(); };
    source.start(); // Already decoded: no media seek, download or async play queue.
    return true;
  }
  stop() { for (const source of this.active) source.stop(); this.active.clear(); }
}
