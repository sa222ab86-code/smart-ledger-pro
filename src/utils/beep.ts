/** تنبيهات صوتية قصيرة (بدون ملفات صوت): خطأ = نغمتان منخفضتان، نجاح = نقرة خفيفة */
let ctx: AudioContext | null = null;
function tone(freq: number, startMs: number, durMs: number, gain = 0.25, type: OscillatorType = 'square') {
  try {
    ctx = ctx || new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime + startMs / 1000;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
    o.connect(g).connect(ctx.destination);
    o.start(t0); o.stop(t0 + durMs / 1000 + 0.02);
  } catch { /* لا صوت في هذه البيئة */ }
}
export function beepError() { tone(440, 0, 160); tone(300, 190, 260); }
/** باركود مكرر عن طريق الخطأ (مسحة مزدوجة أو التصاق مسحتين): «12341234» ← «1234» */
export function undoubleScan(v: string, minLen = 12): string {
  const s = String(v ?? '');
  if (s.length >= minLen && s.length % 2 === 0 && s.slice(0, s.length / 2) === s.slice(s.length / 2)) return s.slice(0, s.length / 2);
  return s;
}
