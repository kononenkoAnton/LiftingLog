import { supabase } from '../lib/supabase'

// Minimal email + password sign-in. Create your single user in the Supabase
// dashboard (Authentication → Users → Add user, Auto Confirm) — then log in here.
export function renderLogin(el: HTMLElement) {
  el.innerHTML = `
    <div class="screen login">
      <div class="login-card">
        <div class="k">LiftingLog</div>
        <h1>Sign in</h1>
        <form id="loginForm">
          <input id="email" type="email" inputmode="email" autocomplete="username" placeholder="Email" required />
          <input id="password" type="password" autocomplete="current-password" placeholder="Password" required />
          <button type="submit" id="loginBtn">Log in</button>
          <div class="login-msg" id="loginMsg"></div>
        </form>
      </div>
    </div>`

  const form = el.querySelector<HTMLFormElement>('#loginForm')!
  const msg = el.querySelector<HTMLElement>('#loginMsg')!
  const btn = el.querySelector<HTMLButtonElement>('#loginBtn')!

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!supabase) return
    const email = (el.querySelector<HTMLInputElement>('#email')!).value.trim()
    const password = (el.querySelector<HTMLInputElement>('#password')!).value
    btn.disabled = true
    msg.textContent = 'Signing in…'
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      msg.textContent = error.message
      btn.disabled = false
    } else {
      location.reload() // boot picks up the session and shows the app
    }
  })
}
