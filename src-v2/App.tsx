import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { RequireAuth } from './components/RequireAuth'
import { CurrentPeladaProvider } from './lib/current-pelada'
import { AuthPage } from './pages/AuthPage'
import { LandingPage } from './pages/LandingPage'
import { NotFoundPage } from './pages/NotFoundPage'

/**
 * Tudo o que vive atrás da autenticação carrega quando for preciso.
 *
 * Quem chega à landing pela primeira vez estava a descarregar a aplicação
 * inteira — o painel de administração, o assistente de criação, o modal do card
 * com as suas partículas — para ler uma página de apresentação. São 564 kB de
 * JavaScript para uma pessoa que ainda não decidiu se quer entrar.
 *
 * A landing, o ecrã de entrada e o 404 ficam de fora da divisão: são os três
 * sítios onde um segundo pedido antes de aparecer alguma coisa se nota mais do
 * que os quilobytes que poupa.
 */
const AccountPage = lazy(() => import('./pages/AccountPage').then((m) => ({ default: m.AccountPage })))
const ClaimPage = lazy(() => import('./pages/ClaimPage').then((m) => ({ default: m.ClaimPage })))
const CreatePeladaPage = lazy(() => import('./pages/CreatePeladaPage').then((m) => ({ default: m.CreatePeladaPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const DiscoverPage = lazy(() => import('./pages/DiscoverPage').then((m) => ({ default: m.DiscoverPage })))
const InvitePage = lazy(() => import('./pages/InvitePage').then((m) => ({ default: m.InvitePage })))
const PeladaPage = lazy(() => import('./pages/PeladaPage').then((m) => ({ default: m.PeladaPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })))

export function App() {
  return <Routes>
    <Route path="/" element={<LandingPage/>}/>
    <Route path="/entrar" element={<AuthPage/>}/>
    <Route element={<Suspense fallback={<RouteFallback/>}><RequireAuth/></Suspense>}>
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

/**
 * O que se vê enquanto o pedaço da rota chega.
 *
 * Deliberadamente calado: numa ligação decente isto dura menos do que um
 * piscar, e uma mensagem de "a carregar" que aparece e desaparece nesse tempo
 * lê-se como um salto. O `aria-busy` diz o que é preciso a quem ouve a página.
 */
function RouteFallback() {
  return <div className="route-fallback" aria-busy="true" aria-live="polite"/>
}
