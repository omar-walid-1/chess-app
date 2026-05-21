// Sound effects باستخدام Web Audio API - مفيش files خارجية
const ctx = () => {
  if (!window._audioCtx) window._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return window._audioCtx;
};

function beep({ freq = 440, type = "sine", duration = 0.1, gain = 0.3, freq2 = null }) {
  try {
    const c = ctx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.connect(g); g.connect(c.destination);
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (freq2) o.frequency.linearRampToValueAtTime(freq2, c.currentTime + duration);
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    o.start(c.currentTime);
    o.stop(c.currentTime + duration);
  } catch {}
}

export function playMove() {
  // صوت حركة عادية - نقرة خشب
  beep({ freq: 800, type: "triangle", duration: 0.06, gain: 0.25 });
}

export function playCapture() {
  // صوت أكل قطعة - أقوى وأعمق
  beep({ freq: 300, type: "sawtooth", duration: 0.08, gain: 0.35 });
  setTimeout(() => beep({ freq: 200, type: "triangle", duration: 0.1, gain: 0.2 }), 40);
}

export function playCheck() {
  // صوت كش - تحذير
  beep({ freq: 600, type: "square", duration: 0.08, gain: 0.2 });
  setTimeout(() => beep({ freq: 800, type: "square", duration: 0.1, gain: 0.2 }), 100);
}

export function playCheckmate() {
  // صوت كش مات - نهاية
  [0, 150, 300, 500].forEach((t, i) => {
    setTimeout(() => beep({ freq: 500 - i * 80, type: "triangle", duration: 0.18, gain: 0.3 }), t);
  });
}

export function playTimerLow() {
  // صوت تحذير الوقت
  beep({ freq: 880, type: "sine", duration: 0.05, gain: 0.15 });
}

export function playTimerEnd() {
  // انتهى الوقت
  beep({ freq: 220, type: "sawtooth", duration: 0.4, gain: 0.4, freq2: 110 });
}

export function playCastle() {
  // صوت التبييت
  beep({ freq: 500, type: "triangle", duration: 0.06, gain: 0.2 });
  setTimeout(() => beep({ freq: 700, type: "triangle", duration: 0.08, gain: 0.25 }), 60);
}

export function playPromotion() {
  // صوت ترقية البيدق - احتفالي
  [0, 80, 160, 240].forEach((t, i) => {
    setTimeout(() => beep({ freq: 400 + i * 150, type: "sine", duration: 0.12, gain: 0.2 }), t);
  });
}
