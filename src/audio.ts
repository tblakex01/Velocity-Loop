export class RaceAudio {
  private context?: AudioContext;
  private engine?: OscillatorNode;
  private gain?: GainNode;
  enabled = true;
  unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.engine = this.context.createOscillator();
      this.engine.type = "sawtooth";
      const filter = this.context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 900;
      this.gain = this.context.createGain();
      this.gain.gain.value = 0;
      this.engine
        .connect(filter)
        .connect(this.gain)
        .connect(this.context.destination);
      this.engine.start();
    }
    void this.context.resume();
  }
  update(speed: number, boosting: boolean, racing: boolean) {
    if (!this.context || !this.engine || !this.gain) return;
    const now = this.context.currentTime;
    this.engine.frequency.setTargetAtTime(
      45 + speed * 5 + (boosting ? 50 : 0),
      now,
      0.1,
    );
    this.gain.gain.setTargetAtTime(
      this.enabled && racing ? 0.012 + Math.min(speed, 40) * 0.0007 : 0,
      now,
      0.08,
    );
  }
  chime(frequency = 660) {
    if (!this.context || !this.enabled) return;
    const osc = this.context.createOscillator(),
      gain = this.context.createGain(),
      now = this.context.currentTime;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain).connect(this.context.destination);
    osc.start();
    osc.stop(now + 0.25);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
  dispose() {
    this.engine?.stop();
    void this.context?.close();
  }
}
