/**
 * Web Audio chiptune player: square lead, triangle bass, noise drums.
 * The AudioContext is created lazily (only once the page has had user input)
 * and resumed on the first pointer/key press, since browsers block autoplay.
 */
import { TRACKS, type TrackName } from "./tracks";

const VOLUME = 0.07;
const LOOKAHEAD_S = 0.12;
const TICK_MS = 25;

type AC = AudioContext;

function midi(n: number): number {
  return 440 * Math.pow(2, (n - 69) / 12);
}

export class Music {
  private ac: AC | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private track: TrackName | null = null;
  private step = 0;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;
  muted = false;

  private readonly unlock = () => {
    this.ensureContext(true);
    void this.ac?.resume().catch(() => {});
  };

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("pointerdown", this.unlock, true);
      window.addEventListener("keydown", this.unlock, true);
    }
  }

  get current(): TrackName | null {
    return this.track;
  }

  /** Start a track (no-op if it is already playing). */
  play(name: TrackName) {
    if (this.destroyed) return;
    if (this.track === name && this.timer !== null) return;
    this.stop();
    this.track = name;
    this.step = 0;
    this.nextTime = 0;
    this.ensureContext(false);
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.track = null;
    // Cut anything already scheduled by swapping the master gain.
    if (this.ac && this.master) {
      try {
        this.master.disconnect();
      } catch {
        /* already disconnected */
      }
      this.master = this.ac.createGain();
      this.master.gain.value = this.muted ? 0 : VOLUME;
      this.master.connect(this.ac.destination);
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ac && this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : VOLUME, this.ac.currentTime, 0.02);
  }

  destroy() {
    this.stop();
    this.destroyed = true;
    if (typeof window !== "undefined") {
      window.removeEventListener("pointerdown", this.unlock, true);
      window.removeEventListener("keydown", this.unlock, true);
    }
    void this.ac?.close().catch(() => {});
    this.ac = null;
    this.master = null;
  }

  private ensureContext(fromGesture: boolean) {
    if (this.ac || this.destroyed || typeof window === "undefined") return;
    const activated = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive;
    if (!fromGesture && activated === false) return; // wait for a gesture
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ac = new Ctor();
    } catch {
      this.ac = null;
      return;
    }
    this.master = this.ac.createGain();
    this.master.gain.value = this.muted ? 0 : VOLUME;
    this.master.connect(this.ac.destination);
    const len = Math.floor(this.ac.sampleRate * 0.5);
    this.noise = this.ac.createBuffer(1, len, this.ac.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    if (fromGesture) void this.ac.resume().catch(() => {});
  }

  private tick() {
    const ac = this.ac;
    if (!ac || !this.track || ac.state !== "running") return;
    const tr = TRACKS[this.track];
    const stepDur = 60 / tr.bpm / tr.stepsPerBeat;
    // Resync after a stall (tab hidden, context just resumed).
    if (this.nextTime < ac.currentTime - 0.05) this.nextTime = ac.currentTime + 0.05;
    while (this.nextTime < ac.currentTime + LOOKAHEAD_S) {
      this.playStep(tr, this.step, this.nextTime, stepDur);
      this.step = (this.step + 1) % tr.lead.length;
      this.nextTime += stepDur;
    }
  }

  private playStep(tr: (typeof TRACKS)[TrackName], i: number, t: number, stepDur: number) {
    const lead = tr.lead[i];
    if (lead != null) this.tone("square", midi(lead), t, stepDur * tr.leadGate, 0.5);
    const bass = tr.bass[i];
    if (bass != null) this.tone("triangle", midi(bass), t, stepDur * 0.95, 0.9);
    switch (tr.drums[i]) {
      case "k":
        this.kick(t);
        break;
      case "s":
        this.hit(t, 0.12, 1200, 0.5);
        break;
      case "h":
        this.hit(t, 0.03, 7000, 0.25);
        break;
    }
  }

  private tone(type: OscillatorType, freq: number, t: number, dur: number, vol: number) {
    const ac = this.ac!;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private kick(t: number) {
    const ac = this.ac!;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  private hit(t: number, dur: number, highpass: number, vol: number) {
    const ac = this.ac!;
    if (!this.noise) return;
    const src = ac.createBufferSource();
    src.buffer = this.noise;
    const f = ac.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = highpass;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}
