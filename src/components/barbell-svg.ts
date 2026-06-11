import type { PlateStack } from '../lib/load'

// Shared plate colors by denomination (lb). 45 red, 35 blue, 25 yellow,
// 10 green; 5 and 2.5 are our own picks (orange, silver-white).
export const PLATE_COLOR: Record<number, string> = {
  45: '#e23b3b', 35: '#3b74e6', 25: '#e6c52e', 10: '#32d46e', 5: '#e6852e', 2.5: '#dfe7f0',
}

// Visual height per plate denomination (px).
const H: Record<number, number> = { 45: 34, 35: 29, 25: 24, 10: 18, 5: 14, 2.5: 10 }

const PW = 7 // plate width

export function barbellSvg(plates: PlateStack[]): string {
  const side = plates.flatMap((p) => Array(p.count).fill(p.plate)) as number[]
  side.sort((a, b) => b - a) // biggest first
  const outToIn = [...side].reverse() // smallest outermost, biggest inboard

  const disc = (p: number, x: number) => {
    const h = H[p] ?? 9
    return `<rect x="${x}" y="${30 - h / 2}" width="${PW}" height="${h}" rx="2" fill="${PLATE_COLOR[p] ?? '#9aa7b8'}"/>`
  }

  // Left stack grows inward (rightward) from the left end; right mirrors it.
  let left = ''
  outToIn.forEach((p, j) => { left += disc(p, 28 + j * PW) })
  let right = ''
  outToIn.forEach((p, j) => { right += disc(p, 172 - PW - j * PW) })

  return `
  <svg viewBox="0 0 200 60" width="100%" height="120" role="img" aria-label="Barbell loading">
    <rect x="22" y="27" width="156" height="6" rx="3" fill="#cdd9e8"/>
    ${left}
    ${right}
  </svg>`
}
