/** Dry contact transients for small wooden discs. Synthesized, not recorded.
 * Broad noise bands avoid the pitched, oscillator-like ring of the first version.
 */
export type SoundKind = 'disc' | 'peg' | 'sink' | 'ditch' | 'land' | 'flick';
interface Voice { bands: number[]; decay: number; brightness: number; duration: number }
const voices: Record<SoundKind, Voice> = {
  disc: { bands: [850, 2200, 4200], decay: 0.0048, brightness: 0.85, duration: 0.065 },
  peg: { bands: [750, 1600, 2900], decay: 0.003, brightness: 0.35, duration: 0.055 },
  sink: { bands: [650, 1500, 3100], decay: 0.006, brightness: 0.5, duration: 0.17 },
  ditch: { bands: [550, 1350, 2800], decay: 0.006, brightness: 0.6, duration: 0.22 },
  land: { bands: [850, 1950, 3600], decay: 0.004, brightness: 0.5, duration: 0.065 },
  flick: { bands: [1100, 2300, 4100], decay: 0.0025, brightness: 0.55, duration: 0.05 },
};
export function impactSamples(kind: SoundKind, sampleRate: number, seed = 1): Float32Array {
  const voice = voices[kind];
  const samples = new Float32Array(Math.ceil(sampleRate * voice.duration));
  let state = seed >>> 0;
  const rand = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const tuning = 0.9 + rand() * 0.2;
  const taps = kind === 'sink' ? [[0, 0.55], [0.031, 1], [0.062, 0.18]] : kind === 'ditch' ? [[0, 1], [0.043, 0.4], [0.091, 0.16]] : [[0, 1]];
  for (const [delay, gain] of taps) {
    // Low-Q bandpass filters: broad, rapidly damped material color, not notes.
    const bands = voice.bands.map(frequency => {
      const w = 2 * Math.PI * frequency * tuning / sampleRate;
      const alpha = Math.sin(w) / (2 * 0.8), a0 = 1 + alpha;
      return { b0: alpha / a0, a1: -2 * Math.cos(w) / a0, a2: (1 - alpha) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
    });
    for (let i = Math.ceil(delay * sampleRate); i < samples.length; i++) {
      const t = i / sampleRate - delay;
      const contact = (rand() * 2 - 1) * Math.exp(-t / voice.decay);
      let value = contact * voice.brightness * 0.3 * Math.exp(-t / 0.001);
      for (let m = 0; m < bands.length; m++) {
        const b = bands[m];
        const y = b.b0 * (contact - b.x2) - b.a1 * b.y1 - b.a2 * b.y2;
        b.x2 = b.x1; b.x1 = contact; b.y2 = b.y1; b.y1 = y;
        value += y * [0.9, 0.65, 0.35][m];
      }
      // Sub-millisecond attack removes digital edge clicks. No bass tone or reverb.
      samples[i] += value * gain * Math.min(1, t / 0.00015) * 1.8;
    }
  }
  for (let i = 0; i < samples.length; i++) samples[i] = Math.tanh(samples[i]) * 0.8;
  return samples;
}
