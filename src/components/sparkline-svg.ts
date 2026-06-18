// Inline SVG sparkline — returns a static string, no deps (mirrors barbell-svg.ts).
// The coordinate math is pure, so it's unit-tested in sparkline-svg.test.ts.

const W = 120
const H = 32
const PAD = 3
const INNER_W = W - PAD * 2
const INNER_H = H - PAD * 2

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Render `values` (oldest → newest) as an inline SVG sparkline string.
 * `''` for no data; a single dot for one point; a polyline + area fill + end dot
 * otherwise. y is normalized per-series (min → bottom, max → top); a flat series
 * (max === min) sits on the midline rather than dividing by zero.
 */
export function sparklineSvg(values: number[], opts: { color?: string } = {}): string {
  const color = opts.color ?? 'currentColor'
  const n = values.length
  if (n === 0) return ''

  const min = Math.min(...values)
  const span = Math.max(...values) - min
  const x = (i: number) => (n === 1 ? PAD + INNER_W / 2 : PAD + (i * INNER_W) / (n - 1))
  const y = (v: number) => PAD + (1 - (span === 0 ? 0.5 : (v - min) / span)) * INNER_H

  const open = `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">`
  const dot = `<circle class="spark-dot" cx="${r2(x(n - 1))}" cy="${r2(y(values[n - 1]))}" r="2.6" fill="${color}"/>`
  if (n === 1) return `${open}${dot}</svg>`

  const pts = values.map((v, i) => `${r2(x(i))},${r2(y(v))}`).join(' ')
  const base = r2(H - PAD)
  const area = `<polygon class="spark-area" points="${PAD},${base} ${pts} ${r2(W - PAD)},${base}" fill="${color}" opacity="0.12"/>`
  const line = `<polyline class="spark-line" points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`
  return `${open}${area}${line}${dot}</svg>`
}
