import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const W = 180, H = 180
const buf = Buffer.alloc(W * H * 4)

const px = (x, y, c) => { const i = (y * W + x) * 4; buf[i] = c[0]; buf[i+1] = c[1]; buf[i+2] = c[2]; buf[i+3] = 255 }
const rect = (x0, x1, y0, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px(x, y, c) }

const BG = [11, 18, 32], BAR = [205, 217, 232], MINT = [39, 230, 180], BLUE = [94, 168, 255]

rect(0, W, 0, H, BG)                 // background
rect(30, 150, 84, 96, BAR)           // bar (through the middle, nubs at the ends)
rect(44, 60, 55, 125, BLUE)          // left outer plate
rect(62, 78, 48, 132, MINT)          // left inner plate
rect(102, 118, 48, 132, MINT)        // right inner plate
rect(120, 136, 55, 125, BLUE)        // right outer plate

// --- encode PNG (RGBA, no deps) ---
const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
const crc32 = (b) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 }
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6
// add filter byte (0) per row
const raw = Buffer.alloc(H * (1 + W * 4))
for (let y = 0; y < H; y++) { raw[y * (1 + W * 4)] = 0; buf.copy(raw, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4) }
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
])
writeFileSync('/Users/antonkononenko/Work/Personal/LiftingLog/public/apple-touch-icon.png', png)
console.log('wrote', png.length, 'bytes')
