import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { RequireAuth } from './components/RequireAuth'
import { CurrentPeladaProvider } from './lib/current-pelada'
import { AuthPage } from './pages/AuthPage'
import { ClaimPage } from './pages/ClaimPage'
import { CreatePeladaPage } from './pages/CreatePeladaPage'
import { AccountPage } from './pages/AccountPage'
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
    <Route element={<RequireAuth/>}>
      <Route path="/convite/:token" element={<InvitePage/>}/>
      <Route element={<AppShell/>}>
        <Route path="/app" element={<DashboardPage/>}/>
        <Route path="/descobrir" element={<DiscoverPage/>}/>
        {/* As páginas por região de §24: um endereço próprio por região, que
            se possa partilhar e indexar. */}
        <Route path="/descobrir/:country" element={<DiscoverPage/>}/>
        <Route path="/descobrir/:country/:region" element={<DiscoverPage/>}/>
        <Route path="/criar" element={<CreatePeladaPage/>}/>
        <Route path="/reclamar" element={<ClaimPage/>}/>
        {/* O mesmo ecra com o codigo ja no endereco: e o link que se
            envia a cada jogador, e poupa-lhe colar o que quer que seja. */}
        <Route path="/reclamar/:code" element={<ClaimPage/>}/>
        <Route path="/u/:username" element={<ProfilePage/>}/>
        <Route path="/conta" element={<AccountPage/>}/>
        {/* Dentro do AppShell, e não ao lado dele. Fora, a página de uma pelada
            ficava sem barra lateral e sem barra inferior — entrava-se numa
            comunidade e deixava de haver caminho de volta ao global. */}
        <Route path="/p/:slug/:section?" element={<CurrentPeladaProvider><PeladaPage/></CurrentPeladaProvider>}/>
      </Route>
    </Route>
    <Route path="/home" element={<Navigate to="/app" replace/>}/>
    <Route path="*" element={<NotFoundPage/>}/>
  </Routes>
}
