import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export function RequireAuth() {
  const { loading, user } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <main className="pelada-route-state" aria-busy="true" aria-label="A validar a sessão">
        <div className="card">
          <span className="pelada-monogram large">KH</span>
        </div>
      </main>
    )
  }

  if (!user) {
    const from = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to="/entrar" replace state={{ from }}/>
  }

  return <Outlet/>
}
