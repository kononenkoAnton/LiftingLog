// Generate the rest-timer "done" gong as a license-clean asset (we synthesize it,
// so there's nothing to attribute). Additive synthesis: a sum of decaying,
// inharmonic sine partials with slight detuned "beating" and a few "blooming"
// upper partials → a metallic gong rather than a plain beep. Partials are centered
// in 500–1500 Hz so the cue still carries on a phone speaker (which rolls off bass).
//
// Run: node scripts/make-gong.mjs   → writes /tmp/gong.wav, then encode to mp3.
import { writeFileSync } from 'node:fs'

const SR = 44100
const DUR = 2.6 // seconds (reference rings ~5s; trimmed so it doesn't drag per set)
const N = Math.floor(SR * DUR)

// {f: Hz, amp: relative, decay: amplitude time-constant s, bloom: attack ms}
// Tuned to match the reference gong (freesound 92707): a DARK gong centered ~616 Hz
// with strong 404/320/160 Hz partials and little energy above ~1.5 kHz. Long `bloom`
// attacks make it swell in (~160ms) rather than strike, and detuned twin partials
// (404/414, 616/622, 1362/1432) beat against each other for the metallic shimmer.
// Frequencies/amps come straight from the FFT of the reference.
const PARTIALS = [
  { f: 160,  amp: 0.68, decay: 0.85, bloom: 90 },  // low body (felt on good speakers)
  { f: 242,  amp: 0.21, decay: 0.70, bloom: 90 },
  { f: 292,  amp: 0.20, decay: 0.70, bloom: 110 },
  { f: 320,  amp: 0.47, decay: 0.75, bloom: 100 },
  { f: 334,  amp: 0.27, decay: 0.72, bloom: 100 }, // beats with 320
  { f: 404,  amp: 0.73, decay: 0.72, bloom: 130 },
  { f: 414,  amp: 0.30, decay: 0.72, bloom: 130 }, // detuned twin → beating
  { f: 616,  amp: 1.00, decay: 0.66, bloom: 160 }, // tonal center, blooms in
  { f: 622,  amp: 0.45, decay: 0.66, bloom: 160 }, // detuned twin
  { f: 868,  amp: 0.25, decay: 0.52, bloom: 130 },
  { f: 976,  amp: 0.44, decay: 0.50, bloom: 160 }, // bloom
  { f: 1100, amp: 0.21, decay: 0.44, bloom: 140 },
  { f: 1362, amp: 0.28, decay: 0.40, bloom: 170 }, // shimmer cluster
  { f: 1400, amp: 0.20, decay: 0.40, bloom: 180 },
  { f: 1432, amp: 0.30, decay: 0.40, bloom: 190 },
]

const TWO_PI = Math.PI * 2
const buf = new Float32Array(N)

for (const p of PARTIALS) {
  const bloomSamp = Math.max(1, Math.floor((p.bloom / 1000) * SR))
  const w = TWO_PI * p.f
  // tiny random phase so partials don't all start aligned (avoids a harsh click)
  const phase = Math.random() * TWO_PI
  for (let i = 0; i < N; i++) {
    const t = i / SR
    // attack: raised-cosine ramp over `bloom` ms, then exponential decay
    const atk = i < bloomSamp ? 0.5 - 0.5 * Math.cos((Math.PI * i) / bloomSamp) : 1
    const env = atk * Math.exp(-t / p.decay)
    buf[i] += p.amp * env * Math.sin(w * t + phase)
  }
}

// Soft mallet-strike transient (reference blooms rather than cracks → keep it light).
for (let i = 0; i < Math.floor(0.025 * SR); i++) {
  const t = i / SR
  buf[i] += (Math.random() * 2 - 1) * 0.03 * Math.exp(-t / 0.008)
}

// Normalize to a safe peak, then a 40 ms fade-out so the tail ends cleanly at zero.
let peak = 0
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(buf[i]))
const gain = 0.89 / (peak || 1)
const fadeSamp = Math.floor(0.04 * SR)
for (let i = 0; i < N; i++) {
  let s = buf[i] * gain
  if (i > N - fadeSamp) s *= (N - i) / fadeSamp
  buf[i] = s
}

// 16-bit PCM mono WAV
const bytesPerSample = 2
const dataLen = N * bytesPerSample
const out = Buffer.alloc(44 + dataLen)
out.write('RIFF', 0)
out.writeUInt32LE(36 + dataLen, 4)
out.write('WAVE', 8)
out.write('fmt ', 12)
out.writeUInt32LE(16, 16)        // fmt chunk size
out.writeUInt16LE(1, 20)         // PCM
out.writeUInt16LE(1, 22)         // mono
out.writeUInt32LE(SR, 24)
out.writeUInt32LE(SR * bytesPerSample, 28) // byte rate
out.writeUInt16LE(bytesPerSample, 32)      // block align
out.writeUInt16LE(16, 34)        // bits per sample
out.write('data', 36)
out.writeUInt32LE(dataLen, 40)
for (let i = 0; i < N; i++) {
  const s = Math.max(-1, Math.min(1, buf[i]))
  out.writeInt16LE(Math.round(s * 32767), 44 + i * bytesPerSample)
}

const dest = process.argv[2] || '/tmp/gong.wav'
writeFileSync(dest, out)
console.log(`wrote ${dest} — ${(out.length / 1024).toFixed(1)} KB, ${DUR}s, ${SR}Hz mono`)
