import './styles/theme.css'
import './styles/app.css'
import { route, startRouter } from './router'
import { renderList } from './screens/list'
import { renderSession } from './screens/session'
import { renderLogin } from './screens/login'
import { renderExercises } from './screens/exercises'
import { renderHistory } from './screens/history'
import { loadProgress } from './lib/progress'
import { loadWorkouts } from './lib/workouts'
import { supabase } from './lib/supabase'

route('/', (el) => renderList(el))
route('/session/:n', (el, p) => renderSession(el, Number(p.n)))
route('/exercises', (el) => renderExercises(el))
route('/history', (el) => renderHistory(el))

const app = document.querySelector<HTMLElement>('#app')!

async function boot() {
  // No backend configured → run locally (localStorage, no auth).
  if (!supabase) {
    await Promise.all([loadProgress(), loadWorkouts()])
    startRouter(app)
    return
  }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    renderLogin(app) // login form; on success it reloads and boot() sees the session
    return
  }
  await Promise.all([loadProgress(), loadWorkouts()]) // hydrate the user's rows, then render the app
  startRouter(app)
}

boot()
