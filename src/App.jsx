import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ackPositionNotice,
  getGoalkeeperStats,
  getLatestMatch,
  getMatches,
  getMyAwardVotes,
  getNextMatch,
  getPendingRatings,
  getPlayers,
  getPlayerStats,
  getPublishedDraw,
} from './api'
import { contarResultados, juntarEstatisticas } from './lib/ranking'
import { calcularLiderancas } from './lib/achievements'
import { POSITION_STATUS } from './lib/positions'
import AdminScreen from './components/AdminScreen'
import AppShell from './components/AppShell'
import DrawsScreen from './components/DrawsScreen'
import HomeScreen from './components/HomeScreen'
import LoginScreen from './components/LoginScreen'
import NextMatch from './components/NextMatch'
import PlayerProfile from './components/PlayerProfile'
import PlayersScreen from './components/PlayersScreen'
import PositionSetupScreen from './components/PositionSetupScreen'
import RankingScreen from './components/RankingScreen'
import RateScreen from './components/RateScreen'
import StatsScreen from './components/StatsScreen'
import { colors, styles } from './theme'

// As páginas que vivem dentro da casca com navegação.
const VIEWS_COM_SHELL = ['home', 'next', 'ranking', 'draws', 'players', 'stats', 'history', 'profile']

export default function App() {
  // Sessão do jogador: { id, name, is_admin, voted, pin, ...posições } — só em memória.
  const [session, setSession] = useState(null)
  const [view, setView] = useState('auth')
  const [profileId, setProfileId] = useState(null)
  const [voltarDoPerfil, setVoltarDoPerfil] = useState('home')
  const [navToken, setNavToken] = useState(0)

  // ---------- dados partilhados por todos os ecrãs ----------
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [avisoPosicao, setAvisoPosicao] = useState('')

  // O carregamento só depende do id e do PIN do jogador. Depender do objeto
  // `session` inteiro fazia com que mudar o PIN, escolher a posição ou marcar
  // as avaliações como feitas disparassem outra vez as nove chamadas — o
  // recarregamento que faz falta é pedido à mão nesses sítios.
  const sessionId = session?.id || null
  const sessionPin = session?.pin || null

  // Token da carga mais recente. O guarda `vivo` só cobre o efeito (que tem
  // cleanup); `carregar` também é chamado à mão — trocar a foto, acabar de
  // avaliar — e essas chamadas não têm forma de ser canceladas. Sem o token,
  // uma resposta lenta de uma sessão antiga escrevia por cima da nova.
  const cargaRef = useRef(0)

  // `vivo` evita escrever estado de uma sessão que já saiu (trocar de conta ou
  // sair a meio do carregamento deixava os dados antigos a chegar depois).
  const carregar = useCallback(async (vivo = { atual: true }) => {
    if (!sessionId) return
    const token = ++cargaRef.current
    try {
      // Só `getPlayers` é obrigatório. Tudo o resto degrada: sem uma migração
      // aplicada, a secção respetiva desaparece em vez de a app rebentar.
      const [players, playerStats, gkStats, matches, proximo, latest, draw, myVotes, pending] =
        await Promise.all([
          getPlayers(),
          getPlayerStats().catch(() => []),
          getGoalkeeperStats().catch(() => null),
          getMatches().catch(() => []),
          getNextMatch().catch(() => undefined),
          getLatestMatch().catch(() => undefined),
          getPublishedDraw().catch(() => null),
          getMyAwardVotes(sessionId, sessionPin).catch(() => []),
          getPendingRatings(sessionId, sessionPin).catch(() => null),
        ])

      if (!vivo.atual || token !== cargaRef.current) return
      const rodadas = matches || []
      const votados = myVotes || []
      setDados({
        players: players || [],
        playerStats: playerStats || [],
        gkStats,
        matches: rodadas,
        proximoJogo: proximo || null,
        latestMatch: latest,
        draw,
        pendingRatings: pending,
        pendingVotes: rodadas.filter(
          (m) =>
            m.players.length >= 3 &&
            m.players.some((p) => p.player_id === sessionId) &&
            !votados.includes(m.id)
        ).length,
      })
      setErro('')
    } catch (err) {
      if (vivo.atual && token === cargaRef.current) setErro(err.message)
    }
  }, [sessionId, sessionPin])

  useEffect(() => {
    const vivo = { atual: true }
    ;(async () => {
      await carregar(vivo)
    })()
    return () => {
      vivo.atual = false
    }
  }, [carregar])

  // Jogadores com overall, posições e resultados — calculado num só sítio para
  // todos os ecrãs verem exatamente os mesmos números.
  const jogadores = useMemo(() => {
    if (!dados) return []
    return juntarEstatisticas({
      players: dados.players,
      playerStats: dados.playerStats,
      goalkeeperStats: dados.gkStats,
      resultados: contarResultados(dados.matches),
    })
  }, [dados])

  const liderancas = useMemo(() => calcularLiderancas({ jogadores }), [jogadores])

  const faltamAvaliar = useMemo(() => {
    if (!dados || !session) return 0
    if (dados.pendingRatings != null) return dados.pendingRatings.length
    return session.voted ? 0 : Math.max(0, (dados.players?.length || 1) - 1)
  }, [dados, session])

  // ---------- navegação ----------
  const navegar = (destino) => {
    if (destino === 'profile') {
      setProfileId(session?.id || null)
      setVoltarDoPerfil('home')
    }
    setView(destino)
    // Conta cada toque na navegação, mesmo quando o destino é o mesmo. Sem
    // isto, tocar em "Histórico" depois de já lá estar (mas com o separador
    // interno mudado à mão para "Geral") não fazia nada: nem a `view` nem o
    // `initialTab` mudavam, e o ecrã não tinha como saber que lhe pediram
    // outra vez o separador das rodadas.
    setNavToken((n) => n + 1)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const abrirPerfil = (id) => {
    if (!id) return
    setProfileId(id)
    setVoltarDoPerfil(VIEWS_COM_SHELL.includes(view) && view !== 'profile' ? view : 'home')
    setView('profile')
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleLogin = (s) => {
    cargaRef.current += 1 // descarta cargas de uma sessão anterior ainda a caminho
    setSession(s)
    setDados(null)
    setErro('')
    setProfileId(null)
    setVoltarDoPerfil('home')
    // O aviso de que o admin mudou a posição vem no login: mostra-se uma vez e
    // marca-se como lido no servidor para não voltar a aparecer no próximo.
    // Escreve-se sempre (nem que seja vazio) para não sobrar o aviso pessoal de
    // quem entrou antes neste mesmo telemóvel.
    setAvisoPosicao(s.position_notice || '')
    if (s.position_notice) ackPositionNotice(s.id, s.pin).catch(() => {})
    // Sem posição definida, o jogador escolhe antes de entrar: o sorteio
    // depende disto e é uma escolha que só se faz uma vez.
    //
    // A comparação é estrita de propósito. Enquanto a migração 0015 não estiver
    // aplicada, o `login` do servidor não devolve `position_status` nenhum —
    // tratar essa ausência como "sem posição" mandava TODA a gente para o ecrã
    // obrigatório, onde o `set_my_positions` ainda não existe e falha com um
    // erro sem saída. Sem a coluna, segue-se o fluxo antigo; com ela aplicada,
    // o valor é NOT NULL e chega sempre preenchido.
    if (s.position_status === POSITION_STATUS.NOT_SELECTED) {
      setView('positions')
      return
    }
    setView(s.voted ? 'home' : 'rate')
  }

  const handleLogout = () => {
    cargaRef.current += 1 // idem: nada do que estava a caminho pode escrever agora
    setSession(null)
    setDados(null)
    setProfileId(null)
    setVoltarDoPerfil('home')
    setAvisoPosicao('')
    setErro('')
    setView('auth')
  }

  // ---------- ecrãs fora da casca ----------
  if (view === 'admin') {
    return <AdminScreen onExit={() => setView(session ? 'home' : 'auth')} />
  }

  if (!session) {
    return <LoginScreen onLogin={handleLogin} onAdmin={() => setView('admin')} />
  }

  if (view === 'positions') {
    return (
      <PositionSetupScreen
        session={session}
        onLogout={handleLogout}
        onDone={(pos) => {
          setSession((s) => ({ ...s, ...pos }))
          setView(session.voted ? 'home' : 'rate')
          carregar() // as posições novas vêm do servidor, não da sessão
        }}
      />
    )
  }

  if (view === 'rate') {
    return (
      <RateScreen
        session={session}
        onDone={() => {
          setSession({ ...session, voted: true })
          setView('home')
          carregar() // sem isto a Home continuava a pedir avaliações já feitas
        }}
        onSkip={() => setView('home')}
      />
    )
  }

  // ---------- páginas dentro da casca ----------
  const carregando = dados === null && !erro
  // Rede de segurança: um `profileId` perdido mostrava a casca com o miolo
  // vazio. Sem perfil escolhido, o perfil é o próprio.
  const perfilId = view === 'profile' ? profileId || session.id : null

  const avisos = avisoPosicao ? (
    <div className="pb-container" style={{ paddingTop: 12 }}>
      <div
        role="status"
        className="pb-card"
        style={{ borderColor: colors.teamB, display: 'flex', gap: 10, alignItems: 'flex-start' }}
      >
        <span aria-hidden>ℹ️</span>
        <span style={{ flex: 1, fontSize: 14 }}>{avisoPosicao}</span>
        <button
          type="button"
          onClick={() => setAvisoPosicao('')}
          aria-label="Fechar aviso"
          style={{ background: 'none', border: 'none', color: colors.muted, fontSize: 18 }}
        >
          ×
        </button>
      </div>
    </div>
  ) : null

  return (
    <AppShell
      session={session}
      foto={jogadores.find((j) => j.id === session.id)?.photo}
      view={view}
      onNavigate={navegar}
      onAdmin={() => setView('admin')}
      onLogout={handleLogout}
      avisos={avisos}
    >
      {view === 'home' && (
        <HomeScreen
          session={session}
          jogadores={jogadores}
          liderancas={liderancas}
          proximoJogo={dados?.proximoJogo}
          draw={dados?.draw}
          latestMatch={dados?.latestMatch}
          totalRodadas={dados?.matches?.length || 0}
          pendingVotes={dados?.pendingVotes || 0}
          faltamAvaliar={faltamAvaliar}
          loading={carregando}
          error={erro}
          onRate={() => setView('rate')}
          onProfile={abrirPerfil}
          onNavigate={navegar}
          onPinChanged={(novo) => setSession((s) => ({ ...s, pin: novo }))}
          onRecarregar={carregar}
        />
      )}

      {view === 'next' && (
        <>
          <h1 style={{ ...styles.title, fontSize: 22, marginBottom: 14 }}>
            Próximo jogo <span style={{ color: colors.grass }}>📅</span>
          </h1>
          <NextMatch jogo={dados?.proximoJogo} onPlayerClick={(j) => abrirPerfil(j.id)} />
        </>
      )}

      {view === 'ranking' && (
        <RankingScreen jogadores={jogadores} liderancas={liderancas} onProfile={abrirPerfil} />
      )}

      {view === 'players' && <PlayersScreen jogadores={jogadores} onProfile={abrirPerfil} />}

      {view === 'draws' && (
        <DrawsScreen
          proximoJogo={dados?.proximoJogo}
          draw={dados?.draw}
          onProfile={abrirPerfil}
        />
      )}

      {(view === 'stats' || view === 'history') && (
        <StatsScreen
          session={session}
          initialTab={view === 'history' ? 'rodadas' : 'geral'}
          navToken={navToken}
          embutido
          onBack={() => navegar('home')}
          onProfile={abrirPerfil}
        />
      )}

      {view === 'profile' && perfilId && (
        <PlayerProfile
          playerId={perfilId}
          totalRodadas={dados?.matches?.length || 0}
          liderancas={liderancas}
          jogador={jogadores.find((j) => j.id === perfilId)}
          embutido
          onBack={() => navegar(voltarDoPerfil)}
        />
      )}
    </AppShell>
  )
}
