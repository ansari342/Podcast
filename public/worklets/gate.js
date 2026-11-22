// Noise gate for "Strong" noise cancellation (S9): mutes the mic below a threshold with smooth attack/release.
class Gate extends AudioWorkletProcessor {
  constructor() { super(); this.env = 0; this.gain = 0; }
  process(inputs, outputs) {
    const i = inputs[0][0], o = outputs[0][0]; if (!i || !o) return true;
    for (let n = 0; n < i.length; n++) {
      const a = Math.abs(i[n]); this.env = a > this.env ? a : this.env * 0.9995;
      const target = this.env > 0.012 ? 1 : 0;
      this.gain += (target - this.gain) * (target ? 0.01 : 0.0005);
      o[n] = i[n] * this.gain;
    }
    return true;
  }
}
registerProcessor('gate', Gate);
