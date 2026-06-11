import type { PlateStack } from '../lib/load'

// Visual height per plate denomination (px).
const H: Record<number, number> = { 45: 30, 35: 26, 25: 22, 10: 16, 5: 12, 2.5: 9 }

export function barbellSvg(plates: PlateStack[]): string {
  const side = plates.flatMap((p) => Array(p.count).fill(p.plate)) as number[]
  side.sort((a, b) => b - a) // biggest inboard
  const disc = (h: number, x: number) =>
    `<rect x="${x}" y="${30 - h / 2}" width="6" height="${h}" rx="2" fill="url(#g)"/>`
  let x = 70, left = ''
  for (const p of side) { x -= 8; left += disc(H[p] ?? 9, x) }
  let xr = 130, right = ''
  for (const p of side) { right += disc(H[p] ?? 9, xr); xr += 8 }
  return `
  <svg viewBox="0 0 200 60" width="100%" height="64" role="img" aria-label="Barbell loading">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#27e6b4"/><stop offset="1" stop-color="#11936f"/>
    </linearGradient></defs>
    ${left}
    <rect x="68" y="27" width="64" height="6" rx="3" fill="#cdd9e8"/>
    ${right}
  </svg>`
}
