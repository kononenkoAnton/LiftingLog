type Render = (el: HTMLElement, params: Record<string, string>) => void
interface Route { pattern: RegExp; keys: string[]; render: Render }

const routes: Route[] = []
let root: HTMLElement

export function route(path: string, render: Render) {
  const keys: string[] = []
  const pattern = new RegExp(
    '^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)' }) + '$'
  )
  routes.push({ pattern, keys, render })
}

function resolve() {
  const hash = location.hash.replace(/^#/, '') || '/'
  for (const r of routes) {
    const m = hash.match(r.pattern)
    if (m) {
      const params: Record<string, string> = {}
      r.keys.forEach((k, i) => (params[k] = m[i + 1]))
      root.innerHTML = ''
      r.render(root, params)
      window.scrollTo(0, 0)
      return
    }
  }
  root.innerHTML = '<div class="screen">Not found</div>'
}

export function startRouter(mount: HTMLElement) {
  root = mount
  window.addEventListener('hashchange', resolve)
  resolve()
}
