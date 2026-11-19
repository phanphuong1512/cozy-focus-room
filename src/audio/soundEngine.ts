import { Howl, Howler } from 'howler';
import type { AudioChannel, AudioMixerState } from '../shared/types';

export type SfxName = 'step' | 'interact' | 'solve' | 'fanfare';

class CozySoundEngine {
  private unlocked = false;
  private ctx: AudioContext | null = null;
  private bgmHowl: Howl | null = null;
  private sfxHowls: Partial<Record<SfxName, Howl>> = {};

  private state: AudioMixerState = {
    muted: false,
    bgm: 0.45,
    rain: 0.35,
    fire: 0.0,
    keyboard: 0.0,
    wind: 0.15,
  };

  private isFocusingDesk = false;

  // Ambient WebAudio gains & timers
  private rainGain: GainNode | null = null;
  private fireGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private keyboardGain: GainNode | null = null;
  private keyboardTimer: number | null = null;
  private crackleTimer: number | null = null;

  constructor() {
    this.initHowls();
  }

  private initHowls() {
    this.bgmHowl = new Howl({
      src: ['/sounds/bgm.wav'],
      loop: true,
      volume: this.state.bgm,
      html5: false,
    });

    this.sfxHowls = {
      step: new Howl({ src: ['/sounds/step.wav'], volume: 0.16 }),
      interact: new Howl({ src: ['/sounds/interact.wav'], volume: 0.32 }),
      solve: new Howl({ src: ['/sounds/solve.wav'], volume: 0.35 }),
      fanfare: new Howl({ src: ['/sounds/fanfare.wav'], volume: 0.4 }),
    };
  }

  public unlockAudio() {
    if (this.unlocked) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }
    this.unlocked = true;

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new AudioCtx();
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      this.setupProceduralAmbience();
    } catch (e) {
      console.warn('[audio] Web Audio init skipped:', e);
    }

    if (this.bgmHowl && !this.bgmHowl.playing() && !this.state.muted) {
      this.bgmHowl.play();
    }

    this.applyAllVolumes();
  }

  private createNoiseBuffer(
    ctx: AudioContext,
    type: 'pink' | 'brown',
    seconds = 4
  ): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * seconds;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    if (type === 'pink') {
      let b0 = 0,
        b1 = 0,
        b2 = 0,
        b3 = 0,
        b4 = 0,
        b5 = 0,
        b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
        b6 = white * 0.115926;
      }
    } else {
      let lastOut = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = data[i];
        data[i] *= 0.8;
      }
    }
    return buffer;
  }

  private setupProceduralAmbience() {
    if (!this.ctx) return;
    const ctx = this.ctx;

    const pinkBuffer = this.createNoiseBuffer(ctx, 'pink', 5);
    const brownBuffer = this.createNoiseBuffer(ctx, 'brown', 5);

    // 1. Rain Generator (Filtered Pink Noise)
    const rainSource = ctx.createBufferSource();
    rainSource.buffer = pinkBuffer;
    rainSource.loop = true;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.value = 1150;
    rainFilter.Q.value = 0.55;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    rainSource.connect(rainFilter);
    rainFilter.connect(this.rainGain);
    this.rainGain.connect(ctx.destination);
    rainSource.start();

    // 2. Fireplace Generator (Warm Brown Rumble + Soft Crackle Pops)
    const fireSource = ctx.createBufferSource();
    fireSource.buffer = brownBuffer;
    fireSource.loop = true;
    const fireFilter = ctx.createBiquadFilter();
    fireFilter.type = 'lowpass';
    fireFilter.frequency.value = 280;
    this.fireGain = ctx.createGain();
    this.fireGain.gain.value = 0;
    fireSource.connect(fireFilter);
    fireFilter.connect(this.fireGain);
    this.fireGain.connect(ctx.destination);
    fireSource.start();

    this.crackleTimer = window.setInterval(() => {
      if (!this.ctx || !this.fireGain || this.state.muted) return;
      const effectiveVol = this.state.fire;
      if (effectiveVol <= 0.02 || Math.random() > 0.45) return;
      this.spawnCracklePop(effectiveVol);
    }, 180);

    // 3. Night Wind Generator (Modulated Low-Pass Brown Noise)
    const windSource = ctx.createBufferSource();
    windSource.buffer = brownBuffer;
    windSource.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 340;
    const windLfo = ctx.createOscillator();
    const windLfoGain = ctx.createGain();
    windLfo.frequency.value = 0.14;
    windLfoGain.gain.value = 180;
    windLfo.connect(windLfoGain);
    windLfoGain.connect(windFilter.frequency);
    windLfo.start();

    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    windSource.connect(windFilter);
    windFilter.connect(this.windGain);
    this.windGain.connect(ctx.destination);
    windSource.start();

    // 4. Mechanical Keyboard ASMR Generator
    this.keyboardGain = ctx.createGain();
    this.keyboardGain.gain.value = 0;
    this.keyboardGain.connect(ctx.destination);

    this.keyboardTimer = window.setInterval(() => {
      if (!this.ctx || !this.keyboardGain || this.state.muted) return;
      const vol = this.state.keyboard;
      if (vol <= 0.02) return;
      // Typing bursts are slightly denser when seated at desk
      const hitChance = this.isFocusingDesk ? 0.72 : 0.48;
      if (Math.random() < hitChance) {
        this.spawnKeyThock();
      }
    }, 150);
  }

  private spawnCracklePop(vol: number) {
    if (!this.ctx || !this.fireGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1400 + Math.random() * 1800, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.025);
    g.gain.setValueAtTime(0.08 * vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    osc.connect(g);
    g.connect(this.fireGain);
    osc.start(now);
    osc.stop(now + 0.035);
  }

  private spawnKeyThock() {
    if (!this.ctx || !this.keyboardGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    osc.type = 'triangle';
    const baseFreq = 260 + Math.random() * 110;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.04);

    filter.type = 'lowpass';
    filter.frequency.value = 1100;

    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    osc.connect(filter);
    filter.connect(g);
    g.connect(this.keyboardGain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  public applyMixerState(next: AudioMixerState) {
    this.state = { ...next };
    this.applyAllVolumes();
  }

  public setChannelVolume(channel: AudioChannel, vol: number) {
    this.state[channel] = Math.max(0, Math.min(1, vol));
    this.applyAllVolumes();
  }

  public setMasterMute(muted: boolean) {
    this.state.muted = muted;
    Howler.mute(muted);
    this.applyAllVolumes();
  }

  public setFocusActivity(focusing: boolean) {
    this.isFocusingDesk = focusing;
  }

  private applyAllVolumes() {
    const muteFactor = this.state.muted ? 0 : 1;

    if (this.bgmHowl) {
      this.bgmHowl.volume(this.state.bgm * 0.55 * muteFactor);
      if (this.unlocked && !this.state.muted && this.state.bgm > 0 && !this.bgmHowl.playing()) {
        this.bgmHowl.play();
      }
    }

    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.rainGain) {
      this.rainGain.gain.setTargetAtTime(this.state.rain * 0.55 * muteFactor, now, 0.08);
    }
    if (this.fireGain) {
      this.fireGain.gain.setTargetAtTime(this.state.fire * 0.7 * muteFactor, now, 0.08);
    }
    if (this.windGain) {
      this.windGain.gain.setTargetAtTime(this.state.wind * 0.35 * muteFactor, now, 0.08);
    }
    if (this.keyboardGain) {
      this.keyboardGain.gain.setTargetAtTime(this.state.keyboard * 0.65 * muteFactor, now, 0.08);
    }
  }

  public playSfx(name: SfxName) {
    if (this.state.muted) return;
    this.unlockAudio();
    const howl = this.sfxHowls[name];
    if (howl) {
      howl.play();
    }
  }

  public dispose() {
    if (this.keyboardTimer) clearInterval(this.keyboardTimer);
    if (this.crackleTimer) clearInterval(this.crackleTimer);
    this.bgmHowl?.unload();
    Object.values(this.sfxHowls).forEach((h) => h?.unload());
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}

export const soundEngine = new CozySoundEngine();
