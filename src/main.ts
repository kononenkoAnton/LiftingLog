import './styles/theme.css'
import './styles/app.css'
import { route, startRouter } from './router'
import { renderList } from './screens/list'
import { renderSession } from './screens/session'
import { loadProgress } from './lib/progress'

route('/', (el) => renderList(el))
route('/session/:n', (el, p) => renderSession(el, Number(p.n)))

// Hydrate progress (finished days + snapshots) before the first render.
loadProgress().then(() => startRouter(document.querySelector<HTMLElement>('#app')!))
