import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ackPositionNotice,
  getCuriosidades,
  getGoalkeeperStats,
  getLatestMatch,
  getMatchCall,
  getMatches,
  getMyOpenVotes,
  getNextMatch,
  getPendingRatings,
  getPlayers,
  getPlayerStats,
  getPublishedDraw,
  loginWithDevice,
  revokeDevice,
} from './api'
import { contarResultados, juntarEstatisticas } from './lib/ranking'
import { calcularLiderancas } from './lib/achievements'
import { calcularSequencias } from './lib/streaks'
import { POSITION_STATUS } from './lib/positions'
import { pendenciasReais } from './lib/voting'
import {
  ROTAS,
  esquecerToken,
  guardarToken,
  lerHash,
  lerToken,
  limparHash,
  navegarPara,
} from './lib/router'
import AdminScreen from './components/AdminScreen'
import AppShell from './components/AppShell'
import BallotScreen from './components/BallotScreen'
import DrawsScreen from './components/DrawsScreen'
import HomeScreen from './components/HomeScreen'
import LoginScreen from './components/LoginScreen'
import NextMatch from './components/NextMatch'
import PlayerCardModal from './components/PlayerCardModal'
import PlayerProfile from './components/PlayerProfile'
import PinPrompt from './components/PinPrompt'
import PlayersScreen from './components/PlayersScreen'
import PositionSetupScreen from './components/PositionSetupScreen'
import QuickLogin from './components/QuickLogin'
import RankingScreen from './components/RankingScreen'
import RateScreen from './components/RateScreen'
import StatsScreen from './components/StatsScreen'
import VotingBanner from './components/VotingBanner'
import { colors, styles } from './theme'

// As páginas que vivem dentro da casca com navegação.
const VIEWS_COM_SHELL = ['home', 'next', 'ranking', 'draws', 'players', 'stats', 'history', 'profile']

export default function App() {
  // Sessão do jogador: { id, name, is_admin, voted, pin, ...posições } — só em memória.
  const [session, setSession] = useState(null)
  const [view, setView] = useState('auth')
  // Token do dispositivo ("lembrar-me"): autoriza ler e votar, nada mais.
  // Fica no estado porque as chamadas de votação o preferem ao PIN — que
  // continua a não ser guardado em lado nenhum.
  const [deviceToken, setDeviceToken] = useState(() => lerToken())
  // Rota do URL. É isto que faz um link do WhatsApp abrir na cédula em vez
  // de morrer no ecrã de login.
  const [rota, setRota] = useState(() => lerHash())
  const [aRestaurar, setARestaurar] = useState(() => Boolean(lerToken()))
  const [profileId, setProfileId] = useState(null)
  // jogador cujo card está aberto por cima do ecrã (null = nenhum)
  const [cardId, setCardId] = useState(null)
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
  const sessionToken = deviceToken || null

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
      const [players, playerStats, gkStats, matches, proximo, latest, draw, porVotar, pending, chamada, curiosidades] =
        await Promise.all([
          getPlayers(),
          getPlayerStats().catch(() => []),
          getGoalkeeperStats().catch(() => null),
          getMatches().catch(() => []),
          getNextMatch().catch(() => undefined),
          getLatestMatch().catch(() => undefined),
          getPublishedDraw().catch(() => null),
          // O que este jogador ainda tem por votar (0025), já com o prazo.
          // Substitui a contagem antiga, que só olhava para o craque/bagre e
          // ignorava por completo a avaliação por estrelas — era por isso que
          // metade da votação não tinha aviso nenhum.
          getMyOpenVotes(sessionId, sessionPin, sessionToken).catch(() => []),
          getPendingRatings(sessionId, sessionPin).catch(() => null),
          // A convocatória do próximo jogo ("vais jogar?"), com quem já
          // respondeu. Sem a migração aplicada fica a null e a pergunta
          // simplesmente não aparece.
          getMatchCall().catch(() => null),
          // As frases da entrada. Não-fatal: sem a função, a Home fica igual
          // menos uma linha.
          getCuriosidades().catch(() => null),
        ])

      // O feed saiu da Home (agora só mostra o estado atual) e passou a viver
      // no separador "Últimas" do Histórico, que o carrega quando é aberto —
      // são posts com fotos em base64, e trazê-los a cada arranque da app
      // custava megabytes de dados móveis a quem nunca lá ia.

      if (!vivo.atual || token !== cargaRef.current) return
      const rodadas = matches || []
      setDados({
        players: players || [],
        playerStats: playerStats || [],
        gkStats,
        matches: rodadas,
        proximoJogo: proximo || null,
        latestMatch: latest,
        draw,
        convocatoria: chamada,
        curiosidades,
        pendingRatings: pending,
        // só o que tem mesmo alguma coisa por fazer: a rodada continuar
        // aberta não é razão para avisar quem já votou em tudo
        porVotar: pendenciasReais(porVotar),
      })
      setErro('')
    } catch (err) {
      if (vivo.atual && token === cargaRef.current) setErro(err.message)
    }
  }, [sessionId, sessionPin, sessionToken])

  useEffect(() => {
    const vivo = { atual: true }
    ;(async () => {
      await carregar(vivo)
    })()
    return () => {
      vivo.atual = false
    }
  }, [carregar])

  // ---------- rota e sessão guardada ----------

  // Ouvir o hash é o que faz o botão "voltar" do browser funcionar e o que
  // apanha os links abertos com a app já aberta.
  useEffect(() => {
    const aoMudar = () => setRota(lerHash())
    window.addEventListener('hashchange', aoMudar)
    return () => window.removeEventListener('hashchange', aoMudar)
  }, [])

  // Token guardado → sessão, sem pedir o PIN. Corre uma vez, no arranque.
  //
  // O token não traz PIN nenhum: a sessão que sai daqui pode ler e votar,
  // mas as ações que exigem PIN (trocar PIN, trocar foto) continuam a pedi-lo
  // — é o servidor que o garante, não este ecrã.
  useEffect(() => {
    // Sem token não há nada a restaurar — e `aRestaurar` já nasceu a false
    // pelo mesmo `lerToken()` no inicializador do estado.
    const token = lerToken()
    if (!token) return undefined
    let vivo = true
    loginWithDevice(token)
      .then((s) => {
        if (!vivo) return
        setSession({ ...s, pin: null, token })
        setDeviceToken(token)
        setAvisoPosicao('')
        setView(s.position_status === POSITION_STATUS.NOT_SELECTED ? 'positions' : 'home')
      })
      .catch(() => {
        // token expirado ou revogado: apagar e seguir para o login normal,
        // em vez de deixar o jogador preso num erro que não sabe resolver
        if (!vivo) return
        esquecerToken()
        setDeviceToken(null)
      })
      .finally(() => {
        if (vivo) setARestaurar(false)
      })
    return () => {
      vivo = false
    }
  }, [])

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
  // sequências por jogador — alimentam os cards de "Invencível", "Homem-Gol"…
  const sequencias = useMemo(() => calcularSequencias(dados?.matches), [dados?.matches])
  const jogadorDoCard = useMemo(
    () => (cardId ? jogadores.find((j) => j.id === cardId) || null : null),
    [cardId, jogadores]
  )

  const faltamAvaliar = useMemo(() => {
    if (!dados || !session) return 0
    if (dados.pendingRatings != null) return dados.pendingRatings.length
    return session.voted ? 0 : Math.max(0, (dados.players?.length || 1) - 1)
  }, [dados, session])

  // Deep-link do feed: "Abrir jogo" aponta para UMA rodada concreta do
  // histórico, não para a lista. Limpo a cada navegação normal.
  const [navMatchId, setNavMatchId] = useState(null)

  // ---------- navegação ----------
  const navegar = (destino, extra) => {
    if (destino === 'profile') {
      setProfileId(session?.id || null)
      setVoltarDoPerfil('home')
    }
    setNavMatchId(extra?.matchId || null)
    setView(destino)
    // Conta cada toque na navegação, mesmo quando o destino é o mesmo. Sem
    // isto, tocar em "Histórico" depois de já lá estar (mas com o separador
    // interno mudado à mão para "Geral") não fazia nada: nem a `view` nem o
    // `initialTab` mudavam, e o ecrã não tinha como saber que lhe pediram
    // outra vez o separador das rodadas.
    setNavToken((n) => n + 1)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Tocar num jogador abre o CARD dele (o pedido da fase D). O perfil
  // completo continua a existir — é um botão dentro do card, e é para lá que
  // vai quem quer o histórico rodada a rodada.
  const abrirCard = (id) => {
    if (!id) return
    setCardId(id)
  }

  const abrirPerfil = (id) => {
    if (!id) return
    setCardId(null)
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
    // Sair tem de fechar mesmo a porta: sem revogar o token, a próxima
    // abertura entrava outra vez sozinha e "sair" não queria dizer nada.
    const token = deviceToken
    if (token) revokeDevice(token).catch(() => {})
    esquecerToken()
    setDeviceToken(null)
    setSession(null)
    setDados(null)
    setProfileId(null)
    setVoltarDoPerfil('home')
    setAvisoPosicao('')
    setErro('')
    limparHash()
    setRota({ rota: null, id: null })
    setView('auth')
  }

  // Entrar pela via rápida (a partir de um link). O token, quando existe, já
  // foi guardado pelo QuickLogin — aqui só entra no estado.
  const handleQuickLogin = (s, token) => {
    if (token) {
      setDeviceToken(token)
      guardarToken(token)
    }
    handleLogin(token ? { ...s, token } : s)
  }

  // ---------- pedir o PIN a meio da sessão ----------
  //
  // Quem entrou pelo "lembrar-me" tem sessão sem PIN: o token autoriza ler e
  // votar, e mais nada. As ações que mexem na conta (foto, PIN, card,
  // posições) continuam a exigi-lo — e sem isto falhavam com "Nome ou PIN
  // incorretos", uma mensagem sem sentido para quem nunca escreveu nenhum.
  //
  // `pedirPin` devolve uma promessa: quem precisa do PIN faz
  // `session.pin || await pedirPin(motivo)` e desiste se vier `null`.
  const resolverPinRef = useRef(null)
  const [pedidoDePin, setPedidoDePin] = useState(null)

  const pedirPin = useCallback(
    (motivo) =>
      new Promise((resolve) => {
        resolverPinRef.current = resolve
        setPedidoDePin({ motivo })
      }),
    []
  )

  const fecharPedidoDePin = (pin) => {
    setPedidoDePin(null)
    // O PIN passa a viver em memória, como em qualquer outra sessão — e só
    // aí. Quem chamou recebe-o pela promessa e não espera pelo estado.
    if (pin) setSession((s) => ({ ...s, pin }))
    resolverPinRef.current?.(pin || null)
    resolverPinRef.current = null
  }

  const irParaVotacao = (matchId) => {
    if (!matchId) return
    navegarPara(ROTAS.VOTAR, matchId)
  }

  const sairDaVotacao = () => {
    limparHash()
    setRota({ rota: null, id: null })
    // Votar não exige ter posição escolhida (e ainda bem — obrigar a isso
    // antes de votar era mais um passo entre o link e o voto). Mas quem
    // entrou pelo link sem posição não pode ficar com o ecrã obrigatório
    // saltado só por ter vindo por aqui.
    setView(session?.position_status === POSITION_STATUS.NOT_SELECTED ? 'positions' : 'home')
    carregar()
  }

  // ---------- ecrãs fora da casca ----------

  // Enquanto se tenta restaurar a sessão guardada, não se pode mostrar o
  // login: o ecrã piscava e o jogador começava a escrever o nome mesmo a
  // tempo de a sessão aparecer por baixo dos dedos.
  if (aRestaurar) {
    return (
      <div style={{ ...styles.page, display: 'grid', placeItems: 'center' }}>
        <p style={styles.mutedText}>A entrar…</p>
      </div>
    )
  }

  // ---------- rota /votar/:id ----------
  // É a razão de existir do router: um link do WhatsApp abre AQUI.
  if (rota.rota === ROTAS.VOTAR && rota.id) {
    if (!session) {
      return (
        <QuickLogin
          motivo="Escolhe o teu nome para votar nesta rodada."
          onEntrar={handleQuickLogin}
          onCancelar={() => {
            limparHash()
            setRota({ rota: null, id: null })
          }}
        />
      )
    }
    return (
      <BallotScreen
        session={session}
        matchId={rota.id}
        token={deviceToken}
        onSair={sairDaVotacao}
        onVotado={carregar}
      />
    )
  }
  // ---------- rota /jogo/:id ----------
  // Vem do "ver o resultado" no fim da votação e das partilhas do feed. Cai
  // no histórico já aberto naquela rodada.
  if (rota.rota === ROTAS.JOGO && rota.id && session) {
    return (
      <StatsScreen
        session={session}
        initialTab="rodadas"
        initialMatchId={rota.id}
        navToken={navToken}
        onBack={sairDaVotacao}
        onProfile={abrirCard}
      />
    )
  }

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
        onPedirPin={pedirPin}
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
        onPedirPin={pedirPin}
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

  const avisoDaPosicao = avisoPosicao ? (
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

  // A faixa da votação vem PRIMEIRO e é fixa: é o lembrete que faltava por
  // completo (a avaliação por estrelas não tinha aviso nenhum) e o que
  // decide se o voto acontece ou não.
  const avisos = (
    <>
      <VotingBanner pendencias={dados?.porVotar} onVotar={irParaVotacao} />
      {avisoDaPosicao}
    </>
  )

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
          convocatoria={dados?.convocatoria}
          curiosidades={dados?.curiosidades}
          latestMatch={dados?.latestMatch}
          porVotar={dados?.porVotar || []}
          faltamAvaliar={faltamAvaliar}
          loading={carregando}
          error={erro}
          token={deviceToken}
          onVotar={irParaVotacao}
          onPedirPin={pedirPin}
          onRate={() => setView('rate')}
          onProfile={abrirCard}
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
          <NextMatch
            jogo={dados?.proximoJogo}
            meuId={session.id}
            onPlayerClick={(j) => abrirCard(j.id)}
          />
        </>
      )}

      {view === 'ranking' && (
        <RankingScreen
          jogadores={jogadores}
          liderancas={liderancas}
          sequencias={sequencias}
          totalRodadas={dados?.matches?.length || 0}
          onProfile={abrirCard}
        />
      )}

      {view === 'players' && <PlayersScreen jogadores={jogadores} onProfile={abrirCard} />}

      {view === 'draws' && (
        <DrawsScreen
          proximoJogo={dados?.proximoJogo}
          draw={dados?.draw}
          onProfile={abrirCard}
        />
      )}

      {(view === 'stats' || view === 'history') && (
        <StatsScreen
          session={session}
          initialTab={view === 'history' ? 'rodadas' : 'geral'}
          initialMatchId={navMatchId}
          navToken={navToken}
          embutido
          onBack={() => navegar('home')}
          onProfile={abrirCard}
        />
      )}

      {view === 'profile' && perfilId && (
        <PlayerProfile
          playerId={perfilId}
          totalRodadas={dados?.matches?.length || 0}
          liderancas={liderancas}
          jogador={jogadores.find((j) => j.id === perfilId)}
          embutido
          session={session}
          token={deviceToken}
          onPedirPin={pedirPin}
          onAtualizado={carregar}
          onBack={() => navegar(voltarDoPerfil)}
        />
      )}

      {/* O card vive por cima de qualquer página: abre-se de onde se tocou e
          fecha-se no mesmo sítio, sem perder o ecrã que estava por baixo. */}
      {jogadorDoCard && (
        <PlayerCardModal
          jogador={jogadorDoCard}
          liderancas={liderancas}
          sequencias={sequencias}
          totalRodadas={dados?.matches?.length || 0}
          session={session}
          onPedirPin={pedirPin}
          onFechar={() => setCardId(null)}
          onVerPerfil={abrirPerfil}
          onAtualizado={carregar}
        />
      )}

      {pedidoDePin && (
        <PinPrompt
          nome={session.name}
          motivo={pedidoDePin.motivo}
          onConfirmar={fecharPedidoDePin}
          onCancelar={() => fecharPedidoDePin(null)}
        />
      )}
    </AppShell>
  )
}
