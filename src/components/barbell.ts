import type { PlateStack } from '../lib/load'
import { barbellSvg } from './barbell-svg'

// 2D front-elevation barbell — no WebGL, no animation. Each plate is drawn as a
// separate, outlined disc so the loading is clearly divided and countable.
export function mountBarbell(container: HTMLElement, plates: PlateStack[]) {
  container.innerHTML = barbellSvg(plates)
}
