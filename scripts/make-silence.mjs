// Generate the keep-alive loop as a license-clean asset (synthesized — nothing to
// attribute), mirroring scripts/make-gong.mjs's WAV writer. The rest timer needs the
// page to stay alive while the screen is locked; an actively-playing <audio loop>
// holds it. We loop near-silence so it's inaudible. DEFAULT is digital silence; if a
// real iOS device still suspends with silence, raise AMP to a faint tone (e.g. 0.0008
// ≈ −62 dBFS @ TONE_HZ) — inaudible but a non-zero signal.
//
// Run: node scripts/make-silence.mjs   → writes public/silence.wav
import { writeFileSync } from 'node:fs'

const SR = 8000       // low sample rate — it's (near) silence; keeps the file tiny (~12 KB)
const DUR = 0.8       // seconds; loops seamlessly (WAV has no encoder padding gaps)
const AMP = 0         // 0 = digital silence; set ~0.0008 for the faint-tone fallback
const TONE_HZ = 120   // only used when AMP > 0
const N = Math.floor(SR * DUR)

const buf = new Float32Array(N)
if (AMP > 0) {
  const w = 2 * Math.PI * TONE_HZ
  for (let i = 0; i < N; i++) buf[i] = AMP * Math.sin((w * i) / SR)
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

const dest = process.argv[2] || 'public/silence.wav'
writeFileSync(dest, out)
console.log(`wrote ${dest} — ${(out.length / 1024).toFixed(1)} KB, ${DUR}s, ${SR}Hz mono, amp=${AMP}`)
