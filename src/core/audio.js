// Web Audio 合成：音效 + 每關獨立 BGM（步進編曲器）。第一次使用者互動後才建立 AudioContext。
const SCALES = {
  majp: [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31],
  dor: [0, 2, 3, 5, 7, 9, 10, 12, 14, 15, 17, 19, 21, 22],
  minp: [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27, 29, 31],
  phr: [0, 1, 3, 5, 7, 8, 10, 12, 13, 15, 17, 19, 20, 22],
  hm: [0, 2, 3, 5, 7, 8, 11, 12, 14, 15, 17, 19, 20, 23],
};
// bass/lead：每字元一個 16 分音符；數字 0-9 與 a-d = 音階級數，'.' = 休止
const TRACKS = [
  { bpm: 112, root: 220, scale: 'majp', wave: 'triangle', bass: '0...0...3...4...', lead: '4.5.7.5.4...2.3.4.5.7.9.7.5.4...' },
  { bpm: 96, root: 196, scale: 'dor', wave: 'sine', bass: '0..0..4.3..3..2.', lead: '7...9.a.9...7.5.4...5.7.9...7...' },
  { bpm: 84, root: 174.6, scale: 'phr', wave: 'triangle', bass: '0.0...1.0.0...6.', lead: '..7.8.7...5.4...3.4.5...4.3.1...' },
  { bpm: 100, root: 233, scale: 'minp', wave: 'sine', bass: '0...2...0...3...', lead: '9.7.9.a.9.7.5...7.5.7.9.7.5.4...' },
  { bpm: 132, root: 164.8, scale: 'hm', wave: 'sawtooth', bass: '0.00.0.0.3.30.5.', lead: '7.6.7.9.a.9.7.6.5.6.7.5.4.3.2...' },
  { bpm: 140, root: 146.8, scale: 'hm', wave: 'square', bass: '00.0.0..0.0.66.5', lead: '7...6...7.9.a.9.c...b.a.9.7.6...' },
  { bpm: 90, root: 261.6, scale: 'majp', wave: 'sine', bass: '0.......4.......', lead: '4...5...7...9...7...5...4...2...' },
];
const deg = ch => (ch >= '0' && ch <= '9' ? +ch : ch.charCodeAt(0) - 87);

export function createAudio() {
  const a = { ctx: null, master: null, music: null, sfxBus: null, muted: false, track: -1, nextT: 0, step: 0 };
  a.unlock = () => {
    if (a.ctx) { if (a.ctx.state === 'suspended') a.ctx.resume().catch(() => {}); return; }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    try {
      a.ctx = new AC();
      a.master = a.ctx.createGain(); a.master.gain.value = a.muted ? 0 : 0.8; a.master.connect(a.ctx.destination);
      a.music = a.ctx.createGain(); a.music.gain.value = 0.16; a.music.connect(a.master);
      a.sfxBus = a.ctx.createGain(); a.sfxBus.gain.value = 0.45; a.sfxBus.connect(a.master);
      a.nextT = a.ctx.currentTime + 0.1;
    } catch (e) { a.ctx = null; }
  };
  a.setMuted = m => { a.muted = m; if (a.master) a.master.gain.setTargetAtTime(m ? 0 : 0.8, a.ctx.currentTime, 0.02); };
  a.toggleMute = () => { a.setMuted(!a.muted); return a.muted; };

  function tone(f, dur, type = 'square', vol = 0.3, f2 = 0, when = 0, bus = a.sfxBus) {
    if (!a.ctx) return;
    const t = (when || a.ctx.currentTime);
    const o = a.ctx.createOscillator(), g = a.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.3, freq = 1200, when = 0) {
    if (!a.ctx) return;
    const t = when || a.ctx.currentTime;
    const n = Math.floor(a.ctx.sampleRate * dur), buf = a.ctx.createBuffer(1, n, a.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = a.ctx.createBufferSource(), f = a.ctx.createBiquadFilter(), g = a.ctx.createGain();
    s.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(a.sfxBus); s.start(t);
  }

  const SFX = {
    jump: () => tone(380, 0.12, 'square', 0.18, 720),
    swim: () => { tone(300, 0.14, 'sine', 0.25, 520); noise(0.12, 0.12, 900); },
    dash: () => { tone(900, 0.14, 'sawtooth', 0.14, 260); noise(0.1, 0.15, 3000); },
    break: () => { noise(0.3, 0.45, 800); tone(140, 0.2, 'square', 0.2, 60); },
    hit: () => { tone(520, 0.08, 'square', 0.25, 180); noise(0.08, 0.2, 2000); },
    hurt: () => { tone(260, 0.25, 'sawtooth', 0.25, 90); },
    pearl: () => { [0, 4, 7, 12].forEach((s, i) => tone(880 * 2 ** (s / 12), 0.18, 'triangle', 0.22, 0, a.ctx.currentTime + i * 0.06)); },
    tide: () => { noise(0.6, 0.3, 500); tone(110, 0.55, 'sine', 0.3, 220); },
    tideDown: () => { noise(0.6, 0.3, 500); tone(220, 0.55, 'sine', 0.3, 100); },
    deny: () => tone(150, 0.1, 'square', 0.15, 120),
    checkpoint: () => { tone(660, 0.12, 'triangle', 0.2); tone(990, 0.2, 'triangle', 0.2, 0, a.ctx.currentTime + 0.1); },
    clear: () => { [0, 4, 7, 12, 16].forEach((s, i) => tone(523 * 2 ** (s / 12), 0.25, 'triangle', 0.25, 0, a.ctx.currentTime + i * 0.09)); },
    win: () => { [0, 4, 7, 12, 7, 12, 16, 19].forEach((s, i) => tone(392 * 2 ** (s / 12), 0.3, 'square', 0.16, 0, a.ctx.currentTime + i * 0.11)); },
    lose: () => { [7, 3, 0, -5].forEach((s, i) => tone(330 * 2 ** (s / 12), 0.3, 'triangle', 0.22, 0, a.ctx.currentTime + i * 0.15)); },
    select: () => tone(700, 0.06, 'square', 0.12),
    start: () => { tone(523, 0.1, 'square', 0.16); tone(784, 0.18, 'square', 0.16, 0, a.ctx.currentTime + 0.08); },
    roar: () => { tone(90, 0.9, 'sawtooth', 0.3, 45); noise(0.9, 0.25, 400); },
    lunge: () => noise(0.5, 0.3, 1500),
    bosshit: () => { tone(200, 0.3, 'square', 0.3, 60); noise(0.25, 0.3, 1200); },
    bubble: () => tone(500, 0.1, 'sine', 0.2, 900),
    paint: () => tone(1200, 0.03, 'square', 0.06),
  };
  a.sfx = name => { if (a.ctx && !a.muted && SFX[name]) try { SFX[name](); } catch (e) { /* 忽略單次音效失敗 */ } };

  a.setMusic = id => { if (a.track === id) return; a.track = id; a.step = 0; if (a.ctx) a.nextT = a.ctx.currentTime + 0.12; };
  // 每幀呼叫：預先排程 0.25 秒內的音符
  a.update = () => {
    if (!a.ctx || a.track < 0 || a.ctx.state !== 'running') return;
    const tr = TRACKS[a.track], sc = SCALES[tr.scale], dt = 60 / tr.bpm / 4;
    if (a.nextT < a.ctx.currentTime - 0.5) a.nextT = a.ctx.currentTime + 0.05;
    while (a.nextT < a.ctx.currentTime + 0.25) {
      const b = tr.bass[a.step % tr.bass.length], l = tr.lead[a.step % tr.lead.length];
      if (b !== '.') tone(tr.root / 2 * 2 ** (sc[deg(b)] / 12), dt * 1.8, 'triangle', 0.5, 0, a.nextT, a.music);
      if (l !== '.') tone(tr.root * 2 ** (sc[deg(l)] / 12), dt * 1.6, tr.wave, tr.wave === 'sine' || tr.wave === 'triangle' ? 0.32 : 0.14, 0, a.nextT, a.music);
      if (a.step % 4 === 0 && a.track >= 4) noise(0.05, 0.08, 6000, a.nextT);
      a.nextT += dt; a.step++;
    }
  };
  return a;
}
