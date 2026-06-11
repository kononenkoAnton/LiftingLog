import type { PlateStack } from '../lib/load'

// Shared plate colors by denomination (lb). 45 red, 35 blue, 25 yellow,
// 10 green; 5 and 2.5 are our own picks (orange, silver-white).
export const PLATE_COLOR: Record<number, string> = {
  45: '#e23b3b', 35: '#3b74e6', 25: '#e6c52e', 10: '#32d46e', 5: '#e6852e', 2.5: '#a06bf0',
}

// Big plates (45/35/25/10) share one tall height and differ by WIDTH (heavier =
// thicker). 5 and 2.5 are shorter change plates with their own heights/widths.
const PHEIGHT: Record<number, number> = { 45: 54, 35: 54, 25: 54, 10: 54, 5: 30, 2.5: 23 }
const PWIDTH: Record<number, number> = { 45: 17, 35: 15, 25: 13, 10: 11, 5: 8, 2.5: 5.5 }

const GAP = 0 // plates sit flush; a 2px divider line separates them instead
const DIV = 'rgba(6,11,20,.65)' // divider / outline colour
const CX = 100 // horizontal centre
const CY = 36 // vertical centre
const CG = 30 // visible centre shaft gap between the two stacks

function plateRect(p: number, x: number): string {
  const w = PWIDTH[p] ?? 9
  const h = PHEIGHT[p] ?? 18
  const c = PLATE_COLOR[p] ?? '#9aa7b8'
  const a = `x="${x}" y="${CY - h / 2}" width="${w}" height="${h}" rx="1"`
  return (
    `<rect ${a} fill="${c}"/>` +
    `<rect ${a} fill="url(#bbSheen)"/>` + // soft top/bottom shading for depth (no white)
    // 2px outline: shared edges between flush plates read as a 2px divider.
    `<rect ${a} fill="none" stroke="${DIV}" stroke-width="2"/>`
  )
}

export function barbellSvg(plates: PlateStack[]): string {
  const order = plates.flatMap((p) => Array(p.count).fill(p.plate)).sort((a, b) => b - a) as number[] // biggest inboard

  let svgPlates = ''
  let minLeftX = CX - CG / 2
  let maxRightX = CX + CG / 2

  // Left stack: biggest against the centre gap, growing outward (left).
  let edge = CX - CG / 2
  for (const p of order) {
    const w = PWIDTH[p] ?? 9
    const x = edge - w
    svgPlates += plateRect(p, x)
    minLeftX = Math.min(minLeftX, x)
    edge -= w + GAP
  }
  // Right stack mirrors it.
  edge = CX + CG / 2
  for (const p of order) {
    const w = PWIDTH[p] ?? 9
    svgPlates += plateRect(p, edge)
    maxRightX = Math.max(maxRightX, edge + w)
    edge += w + GAP
  }

  // Bar hardware sized to the stacks: collars just outboard, then end caps.
  const collarW = 5, collarH = 11, capW = 10, capH = 13
  const colLX = minLeftX - 1 - collarW
  const colRX = maxRightX + 1
  const capLX = colLX - 2 - capW
  const capRX = colRX + collarW + 2
  const shaftL = capLX + capW / 2
  const shaftR = capRX + capW / 2

  const contentLeft = capLX
  const contentRight = capRX + capW
  const pad = 6
  const vbX = contentLeft - pad
  const vbW = contentRight - contentLeft + pad * 2

  return `
  <svg viewBox="${vbX} 0 ${vbW} 72" width="100%" height="138" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Barbell plates loaded per side">
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

    <ellipse cx="${CX}" cy="64" rx="${(contentRight - contentLeft) / 2}" ry="5" fill="url(#bbShadow)"/>

    <rect x="${shaftL}" y="${CY - 2.5}" width="${shaftR - shaftL}" height="5" rx="1.4" fill="url(#bbSteel)"/>
    <rect x="${capLX}" y="${CY - capH / 2}" width="${capW}" height="${capH}" rx="1.6" fill="url(#bbSteel)" stroke="rgba(6,11,20,.35)" stroke-width="0.8"/>
    <rect x="${capRX}" y="${CY - capH / 2}" width="${capW}" height="${capH}" rx="1.6" fill="url(#bbSteel)" stroke="rgba(6,11,20,.35)" stroke-width="0.8"/>
    <rect x="${colLX}" y="${CY - collarH / 2}" width="${collarW}" height="${collarH}" rx="1" fill="#8c9bb0" stroke="rgba(6,11,20,.3)" stroke-width="0.7"/>
    <rect x="${colRX}" y="${CY - collarH / 2}" width="${collarW}" height="${collarH}" rx="1" fill="#8c9bb0" stroke="rgba(6,11,20,.3)" stroke-width="0.7"/>

    ${svgPlates}
  </svg>`
}
