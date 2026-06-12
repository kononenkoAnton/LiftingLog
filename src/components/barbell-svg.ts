import type { PlateStack } from '../lib/load'

// Shared plate colors by denomination (lb). 45 red, 35 blue, 25 yellow,
// 10 green; 5 and 2.5 are our own picks (orange, purple).
export const PLATE_COLOR: Record<number, string> = {
  45: '#e23b3b', 35: '#3b74e6', 25: '#e6c52e', 10: '#32d46e', 5: '#e6852e', 2.5: '#a06bf0',
}

// Big plates (45/35/25/10) share one tall height and differ by WIDTH (heavier =
// thicker). 5 and 2.5 are shorter change plates with their own heights/widths.
const PHEIGHT: Record<number, number> = { 45: 54, 35: 54, 25: 54, 10: 54, 5: 30, 2.5: 23 }
const PWIDTH: Record<number, number> = { 45: 13, 35: 11.5, 25: 10, 10: 8.5, 5: 7, 2.5: 5 }

// Fixed canvas — the barbell always spans the full width (caps near the edges).
const VBW = 200
const VBH = 72
const CY = 36
const PAD = 4 // symmetric left/right padding
const CAP_W = 10 // length of the pole nub past the plates at each end
const COL_W = 5, COL_H = 11
const DIVIDER = 'rgba(6,11,20,.5)' // 1px line between adjacent plates (no silhouette outline)

function plateRect(p: number, x: number): string {
  const w = PWIDTH[p] ?? 9
  const h = PHEIGHT[p] ?? 18
  const c = PLATE_COLOR[p] ?? '#9aa7b8'
  const a = `x="${x}" y="${CY - h / 2}" width="${w}" height="${h}" rx="2.5"`
  return (
    `<rect ${a} fill="${c}"/>` +
    `<rect ${a} fill="url(#bbSheen)"/>` // soft top/bottom shading for depth
  )
}

// 1px vertical divider at a boundary between two flush plates.
function divider(x: number, h: number): string {
  return `<rect x="${x - 0.5}" y="${CY - h / 2}" width="1" height="${h}" fill="${DIVIDER}"/>`
}

export function barbellSvg(plates: PlateStack[]): string {
  const order = plates.flatMap((p) => Array(p.count).fill(p.plate)).sort((a, b) => b - a) as number[] // biggest first
  const fromEnd = [...order].reverse() // smallest first = outermost near the end

  // Hardware anchored to the edges; plates load inboard from the collars.
  const capLX = PAD
  const capRX = VBW - PAD - CAP_W
  const colLX = capLX + CAP_W + 1
  const colRX = capRX - 1 - COL_W
  const startL = colLX + COL_W + 0.5 // left edge of outermost left plate
  const startR = colRX - 0.5 // right edge of outermost right plate

  let left = '', leftDiv = '', right = '', rightDiv = ''
  let xL = startL
  let prevH = 0
  for (const p of fromEnd) {
    const w = PWIDTH[p] ?? 9, h = PHEIGHT[p] ?? 18
    left += plateRect(p, xL)
    if (prevH) leftDiv += divider(xL, Math.min(prevH, h)) // boundary with previous (outer) plate
    prevH = h
    xL += w
  }
  let xR = startR
  prevH = 0
  for (const p of fromEnd) {
    const w = PWIDTH[p] ?? 9, h = PHEIGHT[p] ?? 18
    right += plateRect(p, xR - w)
    if (prevH) rightDiv += divider(xR, Math.min(prevH, h))
    prevH = h
    xR -= w
  }

  // No end caps — the pole continues to the edges as a sleeve nub past the plates.
  const shaftL = capLX
  const shaftR = capRX + CAP_W

  return `
  <svg viewBox="0 0 ${VBW} ${VBH}" width="100%" style="height:auto;display:block" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Barbell plates loaded per side">
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

    <ellipse cx="${VBW / 2}" cy="64" rx="${(capRX + CAP_W - capLX) / 2}" ry="5" fill="url(#bbShadow)"/>

    <rect x="${shaftL}" y="${CY - 2.5}" width="${shaftR - shaftL}" height="5" rx="1.2" fill="url(#bbSteel)"/>
    <rect x="${colLX}" y="${CY - COL_H / 2}" width="${COL_W}" height="${COL_H}" rx="1" fill="#8c9bb0" stroke="rgba(255,255,255,.3)" stroke-width="1"/>
    <rect x="${colRX}" y="${CY - COL_H / 2}" width="${COL_W}" height="${COL_H}" rx="1" fill="#8c9bb0" stroke="rgba(255,255,255,.3)" stroke-width="1"/>

    ${left}
    ${right}
    ${leftDiv}
    ${rightDiv}
  </svg>`
}
