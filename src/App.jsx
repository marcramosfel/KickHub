import { useState } from 'react'
import LoginScreen from './components/LoginScreen'
import RateScreen from './components/RateScreen'
import HomeScreen from './components/HomeScreen'
import AdminScreen from './components/AdminScreen'
import StatsScreen from './components/StatsScreen'

export default function App() {
  // Sessão do jogador: { id, name, is_admin, voted, pin } — só em memória.
  const [session, setSession] = useState(null)
  const [view, setView] = useState('auth') // auth | rate | home | admin | stats
  const [statsTab, setStatsTab] = useState('geral')

  const handleLogin = (s) => {
    setSession(s)
    setView(s.voted ? 'home' : 'rate')
  }

  const handleLogout = () => {
    setSession(null)
    setView('auth')
  }

  if (view === 'admin') {
    return <AdminScreen onExit={() => setView(session ? 'home' : 'auth')} />
  }

  if (!session) {
    return <LoginScreen onLogin={handleLogin} onAdmin={() => setView('admin')} />
  }

  if (view === 'rate') {
    return (
      <RateScreen
        session={session}
        onDone={() => {
          setSession({ ...session, voted: true })
          setView('home')
        }}
        onSkip={() => setView('home')}
      />
    )
  }

  if (view === 'stats') {
    return (
      <StatsScreen
        session={session}
        initialTab={statsTab}
        onBack={() => setView('home')}
      />
    )
  }

  return (
    <HomeScreen
      session={session}
      onLogout={handleLogout}
      onRate={() => setView('rate')}
      onAdmin={() => setView('admin')}
      onStats={(tab) => {
        setStatsTab(tab || 'geral')
        setView('stats')
      }}
    />
  )
}
