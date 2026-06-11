import * as THREE from 'three'
import { gsap } from 'gsap'
import type { PlateStack } from '../lib/load'
import { barbellSvg } from './barbell-svg'

const RADIUS: Record<number, number> = { 45: 0.9, 35: 0.78, 25: 0.66, 10: 0.5, 5: 0.4, 2.5: 0.32 }

function webglOK(): boolean {
  try { return !!document.createElement('canvas').getContext('webgl') } catch { return false }
}

export function mountBarbell(container: HTMLElement, plates: PlateStack[]) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!webglOK() || reduce) { container.innerHTML = barbellSvg(plates); return }

  const w = container.clientWidth || 300, h = 130
  const scene = new THREE.Scene()
  const cam = new THREE.PerspectiveCamera(40, w / h, 0.1, 100)
  cam.position.set(0, 1.1, 7)
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setSize(w, h)
  container.appendChild(renderer.domElement)

  scene.add(new THREE.AmbientLight(0xffffff, 0.6))
  const key = new THREE.DirectionalLight(0x27e6b4, 1.4); key.position.set(2, 3, 4); scene.add(key)
  const rim = new THREE.DirectionalLight(0x5ea8ff, 0.8); rim.position.set(-3, 1, -2); scene.add(rim)

  const group = new THREE.Group(); scene.add(group)
  const bar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 6, 24),
    new THREE.MeshStandardMaterial({ color: 0xcdd9e8, metalness: 0.9, roughness: 0.25 })
  )
  bar.rotation.z = Math.PI / 2; group.add(bar)

  const side = plates.flatMap((p) => Array(p.count).fill(p.plate)).sort((a, b) => b - a) as number[]
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x13d39c, metalness: 0.5, roughness: 0.35, emissive: 0x0a3b2c })
  const made: THREE.Mesh[] = []
  const place = (sign: 1 | -1) => {
    let x = sign * 0.6
    for (const p of side) {
      const r = RADIUS[p] ?? 0.3
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.12, 28), plateMat)
      disc.rotation.z = Math.PI / 2; disc.position.x = x; group.add(disc); made.push(disc)
      x += sign * 0.16
    }
  }
  place(1); place(-1)

  if (!reduce) {
    gsap.from(made, { scale: 0, duration: 0.5, stagger: 0.04, ease: 'back.out(2)' })
    gsap.to(group.rotation, { y: 0.5, duration: 6, yoyo: true, repeat: -1, ease: 'sine.inOut' })
  }

  let raf = 0
  const loop = () => { renderer.render(scene, cam); raf = requestAnimationFrame(loop) }
  loop()

  const obs = new MutationObserver(() => {
    if (!document.body.contains(container)) {
      cancelAnimationFrame(raf); renderer.dispose(); obs.disconnect()
    }
  })
  obs.observe(document.body, { childList: true, subtree: true })
}
