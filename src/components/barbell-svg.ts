import type { PlateStack } from '../lib/load'

// Shared plate colors by denomination (lb). 45 red, 35 blue, 25 yellow,
// 10 green; 5 and 2.5 are our own picks (orange, silver-white).
export const PLATE_COLOR: Record<number, string> = {
  45: '#e23b3b', 35: '#3b74e6', 25: '#e6c52e', 10: '#32d46e', 5: '#e6852e', 2.5: '#dfe7f0',
}

// Plate height (diameter) per denomination, in viewBox units.
const H: Record<number, number> = { 45: 50, 35: 43, 25: 36, 10: 27, 5: 21, 2.5: 15 }

const PW = 11 // plate width
const GAP = 2.5 // gap between plates so each reads as divided
const CY = 35 // vertical centre
const OUT_L = 26 // x of the left outermost plate
const OUT_R = 174 - PW // x of the right outermost plate

function plate(p: number, x: number): string {
  const h = H[p] ?? 13
  const c = PLATE_COLOR[p] ?? '#9aa7b8'
  const y = CY - h / 2
  const r = `x="${x}" y="${y}" width="${PW}" height="${h}" rx="3.5"`
  return (
    `<rect ${r} fill="${c}"/>` +
    `<rect ${r} fill="url(#bbSheen)"/>` + // soft top/bottom shading for depth (no white)
    `<rect ${r} fill="none" stroke="rgba(6,11,20,.5)" stroke-width="1.2"/>`
  )
}

export function barbellSvg(plates: PlateStack[]): string {
  const side = plates.flatMap((p) => Array(p.count).fill(p.plate)) as number[]
  side.sort((a, b) => b - a) // biggest first
  const outToIn = [...side].reverse() // smallest outermost, biggest inboard

  let left = ''
  outToIn.forEach((p, j) => { left += plate(p, OUT_L + j * (PW + GAP)) })
  let right = ''
  outToIn.forEach((p, j) => { right += plate(p, OUT_R - j * (PW + GAP)) })

  return `
  <svg viewBox="0 0 200 72" width="100%" height="138" role="img" aria-label="Barbell plates loaded per side">
    <defs>
      <linearGradient id="bbSteel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#eef3f9"/>
        <stop offset="0.45" stop-color="#cdd8e6"/>
        <stop offset="1" stop-color="#93a3b8"/>
      </linearGradient>
      <linearGradient id="bbSheen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#000" stop-opacity="0.18"/>
        <stop offset="0.42" stop-color="#000" stop-opacity="0"/>
        <stop offset="1" stop-color="#000" stop-opacity="0.34"/>
      </linearGradient>
      <radialGradient id="bbShadow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#000" stop-opacity="0.35"/>
        <stop offset="1" stop-color="#000" stop-opacity="0"/>
      </radialGradient>
    </defs>

    <!-- soft ground shadow -->
    <ellipse cx="100" cy="64" rx="78" ry="5" fill="url(#bbShadow)"/>

    <!-- shaft -->
    <rect x="16" y="32.6" width="168" height="4.8" rx="2.4" fill="url(#bbSteel)"/>
    <!-- end caps -->
    <rect x="11" y="28.5" width="9.5" height="13" rx="3" fill="url(#bbSteel)" stroke="rgba(6,11,20,.35)" stroke-width="0.8"/>
    <rect x="179.5" y="28.5" width="9.5" height="13" rx="3" fill="url(#bbSteel)" stroke="rgba(6,11,20,.35)" stroke-width="0.8"/>
    <!-- collars (clamp the plates) -->
    <rect x="${OUT_L - 5.5}" y="29.5" width="5" height="11" rx="1.6" fill="#8c9bb0" stroke="rgba(6,11,20,.3)" stroke-width="0.7"/>
    <rect x="${OUT_R + PW + 0.5}" y="29.5" width="5" height="11" rx="1.6" fill="#8c9bb0" stroke="rgba(6,11,20,.3)" stroke-width="0.7"/>

    ${left}
    ${right}
  </svg>`
}
