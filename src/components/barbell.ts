import * as THREE from 'three'
import { gsap } from 'gsap'
import type { PlateStack } from '../lib/load'
import { barbellSvg, PLATE_COLOR } from './barbell-svg'

const RADIUS: Record<number, number> = { 45: 0.92, 35: 0.82, 25: 0.72, 10: 0.58, 5: 0.48, 2.5: 0.4 }

// Bar geometry (units): shaft spans [-BAR_HALF, BAR_HALF]; plates load on the
// sleeves near each end, stacked biggest-inboard, with a small nub past them.
const BAR_HALF = 2.7
const SLEEVE_INNER = 1.5
const END_X = 2.5 // outer face of the plate stack; ~0.2 nub remains to BAR_HALF
const THICK = 0.24 // plate thickness along the bar — chunky enough to read as solid

function webglOK(): boolean {
  try { return !!document.createElement('canvas').getContext('webgl') } catch { return false }
}

export function mountBarbell(container: HTMLElement, plates: PlateStack[]) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!webglOK() || reduce) { container.innerHTML = barbellSvg(plates); return }

  const w = container.clientWidth || 300, h = 130
  const scene = new THREE.Scene()
  const cam = new THREE.PerspectiveCamera(40, w / h, 0.1, 100)
  cam.position.set(0, 1.1, 8)
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setSize(w, h)
  container.appendChild(renderer.domElement)

  // Mostly-white lighting so the plate colors read true, with a faint colored rim.
  scene.add(new THREE.AmbientLight(0xffffff, 0.85))
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(2, 3, 4); scene.add(key)
  const rim = new THREE.DirectionalLight(0x5ea8ff, 0.5); rim.position.set(-3, 1, -2); scene.add(rim)

  const group = new THREE.Group(); scene.add(group)
  // Hold a 3/4 view so plates always read as solid discs (never edge-on).
  group.rotation.set(0.12, 0.6, 0)

  // Steel bar: thin shaft + thicker sleeves at the ends.
  const steel = new THREE.MeshStandardMaterial({ color: 0xcdd9e8, metalness: 0.9, roughness: 0.25 })
  const parts: THREE.Mesh[] = []
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, BAR_HALF * 2, 20), steel)
  shaft.rotation.z = Math.PI / 2; group.add(shaft); parts.push(shaft)
  for (const sign of [1, -1] as const) {
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, BAR_HALF - SLEEVE_INNER + 0.3, 20), steel)
    sleeve.rotation.z = Math.PI / 2
    sleeve.position.x = sign * (SLEEVE_INNER + (BAR_HALF - SLEEVE_INNER + 0.3) / 2 - 0.15)
    group.add(sleeve); parts.push(sleeve)
  }

  // One cached material per denomination so colors read distinctly.
  const matFor = new Map<number, THREE.MeshStandardMaterial>()
  const plateMaterial = (denom: number) => {
    let m = matFor.get(denom)
    if (!m) {
      const c = new THREE.Color(PLATE_COLOR[denom] ?? '#9aa7b8')
      m = new THREE.MeshStandardMaterial({ color: c, metalness: 0.35, roughness: 0.45, emissive: c.clone().multiplyScalar(0.12) })
      matFor.set(denom, m)
    }
    return m
  }

  const side = plates.flatMap((p) => Array(p.count).fill(p.plate)).sort((a, b) => b - a) as number[]
  const made: THREE.Mesh[] = []
  const place = (sign: 1 | -1) => {
    // Smallest plate outermost (against the nub), biggest inboard against the collar.
    const ordered = [...side].reverse()
    ordered.forEach((p, j) => {
      const r = RADIUS[p] ?? 0.36
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, THICK * 0.9, 30), plateMaterial(p))
      disc.rotation.z = Math.PI / 2
      disc.position.x = sign * (END_X - (j + 0.5) * THICK)
      group.add(disc); made.push(disc)
    })
  }
  place(1); place(-1)

  const tweens: gsap.core.Tween[] = []
  if (!reduce) {
    // Mesh.scale is a read-only Vector3 — tween its x/y/z components, not a scalar.
    tweens.push(gsap.from(made.map((m) => m.scale), { x: 0, y: 0, z: 0, duration: 0.5, stagger: 0.04, ease: 'back.out(2)' }))
    // Infinite tween — must be killed on teardown, or it pins the group in memory.
    // Gentle oscillation around the 3/4 base so it stays lively but always readable.
    tweens.push(gsap.to(group.rotation, { y: 0.82, duration: 5, yoyo: true, repeat: -1, ease: 'sine.inOut' }))
  }

  let raf = 0
  const loop = () => { renderer.render(scene, cam); raf = requestAnimationFrame(loop) }
  loop()

  // Free everything once the container leaves the DOM (route change or refocus
  // rebuild both remove #bb). Killing the tweens is load-bearing: the infinite
  // rotation tween holds group.rotation, which would otherwise keep the meshes
  // alive and make renderer.dispose() ineffective.
  const obs = new MutationObserver(() => {
    if (!document.body.contains(container)) {
      tweens.forEach((t) => t.kill())
      cancelAnimationFrame(raf)
      ;[...parts, ...made].forEach((m) => (m.geometry as THREE.BufferGeometry).dispose())
      steel.dispose()
      matFor.forEach((m) => m.dispose())
      renderer.dispose()
      obs.disconnect()
    }
  })
  obs.observe(document.body, { childList: true, subtree: true })
}
