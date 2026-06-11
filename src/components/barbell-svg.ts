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

function plate(p: number, x: number): string {
  const h = H[p] ?? 13
  const c = PLATE_COLOR[p] ?? '#9aa7b8'
  return (
    `<rect x="${x}" y="${CY - h / 2}" width="${PW}" height="${h}" rx="3" ` +
    `fill="${c}" stroke="rgba(6,11,20,.6)" stroke-width="1.3"/>` +
    // subtle inner highlight strip down the plate face
    `<rect x="${x + PW / 2 - 0.6}" y="${CY - h / 2 + 3}" width="1.2" height="${h - 6}" rx="0.6" fill="rgba(255,255,255,.22)"/>`
  )
}

export function barbellSvg(plates: PlateStack[]): string {
  const side = plates.flatMap((p) => Array(p.count).fill(p.plate)) as number[]
  side.sort((a, b) => b - a) // biggest first
  const outToIn = [...side].reverse() // smallest outermost, biggest inboard

  // Left stack grows inward (rightward) from the left end; right mirrors it.
  let left = ''
  outToIn.forEach((p, j) => { left += plate(p, 26 + j * (PW + GAP)) })
  let right = ''
  outToIn.forEach((p, j) => { right += plate(p, 174 - PW - j * (PW + GAP)) })

  return `
  <svg viewBox="0 0 200 70" width="100%" height="132" role="img" aria-label="Barbell plates loaded per side">
    <!-- steel shaft + sleeves -->
    <rect x="16" y="32.5" width="168" height="5" rx="2.5" fill="#c3cedd"/>
    <rect x="22" y="30.5" width="10" height="9" rx="2" fill="#9fb0c4"/>
    <rect x="168" y="30.5" width="10" height="9" rx="2" fill="#9fb0c4"/>
    ${left}
    ${right}
  </svg>`
}
