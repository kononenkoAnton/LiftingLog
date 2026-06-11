import './styles/theme.css'
import './styles/app.css'
import { route, startRouter } from './router'
import { renderList } from './screens/list'
import { renderSession } from './screens/session'

route('/', (el) => renderList(el))
route('/session/:n', (el, p) => renderSession(el, Number(p.n)))

startRouter(document.querySelector<HTMLElement>('#app')!)
