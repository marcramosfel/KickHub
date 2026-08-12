import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { AuthPage } from './pages/AuthPage'
import { CreatePeladaPage } from './pages/CreatePeladaPage'
import { DashboardPage } from './pages/DashboardPage'
import { DiscoverPage } from './pages/DiscoverPage'
import { LandingPage } from './pages/LandingPage'
import { InvitePage } from './pages/InvitePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PeladaPage } from './pages/PeladaPage'
import { ProfilePage } from './pages/ProfilePage'

export function App() {
  return <Routes>
    <Route path="/" element={<LandingPage/>}/>
    <Route path="/entrar" element={<AuthPage/>}/>
    <Route path="/convite/:token" element={<InvitePage/>}/>
    <Route element={<AppShell/>}>
      <Route path="/app" element={<DashboardPage/>}/>
      <Route path="/descobrir" element={<DiscoverPage/>}/>
      <Route path="/criar" element={<CreatePeladaPage/>}/>
      <Route path="/u/:username" element={<ProfilePage/>}/>
    </Route>
    <Route path="/p/:slug/:section?" element={<PeladaPage/>}/>
    <Route path="/home" element={<Navigate to="/app" replace/>}/>
    <Route path="*" element={<NotFoundPage/>}/>
  </Routes>
}
