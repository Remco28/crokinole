import type { PhysicsEvent } from '../sim/physics';
import { impactSamples, type SoundKind } from './synthesis';

export class BoardSound {
  private context?: AudioContext;
  private master?: GainNode;
  private buffers = new Map<SoundKind, AudioBuffer[]>();
  private voices = 0;
  private variation = 0;
  private volume = 0.65;
  private muted = false;
  private listenerYaw = 0;
  private lastHits = new Map<string, number>();

  /** Called from a real pointer/keyboard gesture, respecting browser audio unlock. */
  async unlock(): Promise<boolean> {
    try {
      if (!this.context) this.initialize();
      if (this.context!.state !== 'running') await this.context!.resume();
      return this.context!.state === 'running';
    } catch { return false; }
  }

  private initialize() {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.context = ctx;
    const master = ctx.createGain(); this.master = master;
    master.gain.value = this.muted ? 0 : this.volume;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8; limiter.knee.value = 6; limiter.ratio.value = 8;
    limiter.attack.value = 0.002; limiter.release.value = 0.08;
    master.connect(limiter); limiter.connect(ctx.destination);
    for (const kind of ['disc', 'peg', 'sink', 'ditch', 'land', 'flick'] as SoundKind[]) {
      this.buffers.set(kind, Array.from({ length: 5 }, (_, i) => {
        const values = impactSamples(kind, ctx.sampleRate, i + 11);
        const buffer = ctx.createBuffer(1, values.length, ctx.sampleRate);
        buffer.getChannelData(0).set(values); return buffer;
      }));
    }
  }

  setPreferences(volume: number, muted: boolean) {
    this.volume = Math.max(0, Math.min(1, volume)); this.muted = muted;
    if (this.context && this.master) this.master.gain.setTargetAtTime(muted ? 0 : this.volume, this.context.currentTime, 0.015);
  }
  private pan(x: number, y: number) { return Math.max(-0.8, Math.min(0.8, (x * Math.cos(this.listenerYaw) - y * Math.sin(this.listenerYaw)) / 17)); }

  play(kind: SoundKind, speed: number, x = 0, y = 0, delay = 0) {
    const ctx = this.context;
    if (!ctx || !this.master || ctx.state !== 'running' || this.muted || this.volume === 0 || this.voices >= 24) return;
    const source = ctx.createBufferSource();
    source.buffer = this.buffers.get(kind)![this.variation++ % 5];
    const strength = Math.min(1, Math.pow(Math.max(0, speed) / 90, 0.7));
    source.playbackRate.value = 1;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 2200 + strength * 7500;
    const gain = ctx.createGain(); gain.gain.value = (kind === 'flick' ? 0.28 : 0.8) * strength;
    const pan = ctx.createStereoPanner(); pan.pan.value = this.pan(x, y);
    source.connect(filter); filter.connect(gain); gain.connect(pan); pan.connect(this.master);
    this.voices++;
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); pan.disconnect(); this.voices--; };
    source.start(ctx.currentTime + delay);
  }

  impact = (event: PhysicsEvent) => {
    if (!this.context || event.speed < 2) return;
    const now = this.context.currentTime, previous = this.lastHits.get(event.key);
    if (previous !== undefined && now - previous < 0.025) return;
    this.lastHits.set(event.key, now);
    if (this.lastHits.size > 128) for (const [key, time] of this.lastHits) if (now - time > 1) this.lastHits.delete(key);
    this.play(event.kind === 'lip' ? 'land' : event.kind, event.speed, event.x, event.y);
  };

  setListenerYaw(yaw: number) { this.listenerYaw = yaw; }

  async preview() {
    if (!await this.unlock()) return false;
    this.play('disc', 10, -3, 0, 0);
    this.play('disc', 40, 0, 0, 0.4);
    this.play('disc', 90, 3, 0, 0.8);
    this.play('peg', 50, 5, 0, 1.2);
    this.play('sink', 30, 0, 0, 1.6);
    this.play('ditch', 45, 7, 0, 2);
    return true;
  }

  suspend() { if (this.context?.state === 'running') void this.context.suspend().catch(() => {}); }
}
