import { useCallback, useMemo, useRef, useState } from 'react'
import {
  adminAddMedia,
  adminCancelMatch,
  adminCloseGame,
  adminDeleteMedia,
  adminDeletePost,
  adminDeleteSchedule,
  adminMatchActivity,
  adminPublishResult,
  adminSaveGkStats,
  adminSaveMatch,
  adminSaveResult,
  adminSetPrimaryMedia,
  adminUpdatePost,
  getFeed,
} from '../../api'
import { formatarDataDoJogo } from '../../lib/countdown'
import { fileToDataURL } from '../../lib/image'
import {
  FASES,
  ETIQUETA_DA_FASE,
  ORDEM_DAS_FASES,
  acoesDoJogo,
  atividadeLegivel,
} from '../../lib/lifecycle'
import { calcularSequencias } from '../../lib/streaks'
import { gerarResenhaResultado } from '../../lib/resenha'
import { separarEscalacao } from '../../lib/goleiros'
import { nomeDaEquipa, corDaEquipa } from '../../lib/substitutions'
import { candidatosBagre, candidatosCraque, ladoVencedor, semLadosDefinidos } from '../../lib/awards'
import { prazoPorOmissao, prazoLegivel } from '../../lib/voting'
import { urlDaVotacao } from '../../lib/router'
import { copiarTexto, mensagemDeVotacao, partilharTexto } from '../../lib/share'
import Avatar from '../Avatar'
import FootballPitch from '../FootballPitch'
import ResenhaEditor from './ResenhaEditor'
import ResultadoForm from './ResultadoForm'
import VotingPanel from './VotingPanel'
import { ErrorBox } from '../Ui'
import { colors, fonts, styles, chip, disabled } from '../../theme'

// A página de UM jogo: tudo o que lhe pertence — agenda, equipas, resultado,
// fotos, histórico e ações — num sítio só. É aqui (e só aqui) que se preenche
// e publica o resultado.
//
// Serve os dois tipos de jogo, e é de propósito:
//
//   AGENDADO  passou pelo assistente, tem escalação sorteada. O resultado
//             grava-se com `admin_save_result` / `admin_close_game`.
//   ANTIGO    nunca foi agendado (ou é anterior ao ciclo de vida). Não tem
//             escalação: a lista de jogadores é o plantel, com caixas de
//             presença, e grava-se com `admin_save_match`, que também mexe
//             na data e nos nomes das equipas.
//
// A alternativa era o que existia: dois painéis com dois formulários para a
// mesma coisa, que já tinham divergido (o autogolo teria de nascer duas
// vezes; a regra do goleiro já estava diferente).

const TOM_COR = { ok: colors.grass, aviso: colors.teamA, erro: colors.error, neutro: colors.muted }

function FaseChip({ fase }) {
  const e = ETIQUETA_DA_FASE[fase] || { texto: fase, icone: '•', tom: 'neutro' }
  const cor = TOM_COR[e.tom] || colors.muted
  return (
    <span style={chip(cor, `${cor}1A`)}>
      <span aria-hidden>{e.icone}</span> {e.texto}
    </span>
  )
}

// A régua do ciclo de vida: onde este jogo está, do rascunho ao fecho.
function Timeline({ fase }) {
  if (fase === FASES.CANCELADO) return null
  const atual = ORDEM_DAS_FASES.indexOf(fase)
  return (
    <ol
      aria-label="Fases do jogo"
      style={{ display: 'flex', listStyle: 'none', margin: '10px 0 0', padding: 0, gap: 4 }}
    >
      {ORDEM_DAS_FASES.map((f, i) => {
        const feito = i <= atual
        return (
          <li key={f} style={{ flex: 1, minWidth: 0 }} title={ETIQUETA_DA_FASE[f].texto}>
            <div
              style={{
                height: 4,
                borderRadius: 999,
                background: feito ? colors.grass : colors.line,
              }}
            />
          </li>
        )
      })}
    </ol>
  )
}


// Uma publicação do feed deste jogo, com edição inline do título e do corpo.
function PostDoJogo({ post, busy, onGuardar, onApagar }) {
  const [editando, setEditando] = useState(false)
  const [titulo, setTitulo] = useState(post.title || '')
  const [corpo, setCorpo] = useState(post.body || '')
  const d = formatarDataDoJogo(post.published_at)

  return (
    <li style={{ border: `1px solid ${colors.line}`, borderRadius: 10, padding: 10 }}>
      {editando ? (
        <div>
          <input
            aria-label="Título da publicação"
            style={{ ...styles.input, marginBottom: 8 }}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
          />
          <textarea
            aria-label="Texto da publicação"
            rows={3}
            style={{ ...styles.input, resize: 'vertical', fontSize: 13, marginBottom: 8 }}
            value={corpo}
            onChange={(e) => setCorpo(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onGuardar(titulo, corpo)
                setEditando(false)
              }}
              style={{ ...styles.button, width: 'auto', padding: '8px 14px', fontSize: 13 }}
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setEditando(false)}
              style={{ ...styles.buttonGhost, width: 'auto', padding: '8px 14px', fontSize: 13 }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14 }}>{post.title}</strong>
            <span style={{ fontSize: 11, color: colors.muted, marginLeft: 'auto' }}>
              {d.hora ? `${d.data} ${d.hora}` : ''}
            </span>
          </div>
          {post.body && (
            <p style={{ fontSize: 13, color: colors.muted, margin: '6px 0 0', whiteSpace: 'pre-line' }}>
              {post.body}
            </p>
          )}
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setEditando(true)}
              style={{ background: 'none', border: 'none', color: colors.teamA, fontSize: 12, textDecoration: 'underline', padding: 0 }}
            >
              ✏️ Editar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onApagar}
              style={{ background: 'none', border: 'none', color: colors.error, fontSize: 12, textDecoration: 'underline', padding: 0 }}
            >
              🗑️ Apagar
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

function Seccao({ titulo, children, tom }) {
  return (
    <div className="pb-card" style={tom ? { borderColor: tom } : undefined}>
      <div style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 14, marginBottom: 10 }}>
        {titulo}
      </div>
      {children}
    </div>
  )
}

export default function GameDetail({ pw, jogo, jogadores, matches, onVoltar, onAtualizado, onAbrirAssistente, onAbrirDesistencias, onApagado }) {
  const acoes = useMemo(() => acoesDoJogo(jogo), [jogo])
  const fase = acoes.fase

  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [busy, setBusy] = useState(false)
  const submetendoRef = useRef(false) // clique duplo não publica duas vezes

  // ---------- formulário do resultado ----------
  const escalacao = useMemo(() => (Array.isArray(jogo?.lineup) ? jogo.lineup : []), [jogo])

  // Rodada antiga: sem escalação, mas já com resultado para preencher ou
  // corrigir. É o que troca a lista de jogadores pelo plantel e o caminho de
  // gravação para o `admin_save_match`.
  const semEscalacao = escalacao.length === 0
  const modoHistorico = semEscalacao && acoes.preencherResultado

  // Estado inicial: o que já estiver gravado; senão a escalação a zeros.
  // Guardado por id para os steppers não se atropelarem.
  const [form, setForm] = useState(() => {
    const stats = {}
    const jogou = {}
    const base = Array.isArray(jogo?.stats) && jogo.stats.length ? jogo.stats : null
    if (base) {
      for (const s of base) {
        stats[s.player_id] = {
          team: s.team,
          goals: s.goals || 0,
          assists: s.assists || 0,
          own: s.own_goals || 0,
        }
        jogou[s.player_id] = true
      }
    } else {
      for (const l of escalacao) stats[l.player_id] = { team: l.team, goals: 0, assists: 0, own: 0 }
    }
    // Quem tem números de baliza. Num jogo de goleiros fixos os dois entram
    // sempre (é o que se espera preencher); no rodízio e nas rodadas antigas
    // só entra quem JÁ tem linha gravada — ver `lib/goleiros.js`.
    const gk = {}
    for (const g of Array.isArray(jogo?.gk_stats) ? jogo.gk_stats : []) {
      gk[g.goalkeeper_id] = { saves: g.saves || 0, conceded: g.goals_conceded || 0 }
    }
    for (const g of separarEscalacao(jogo, escalacao).baliza) {
      if (!gk[g.player_id]) gk[g.player_id] = { saves: 0, conceded: 0 }
    }
    return {
      scoreA: jogo?.score_a ?? 0,
      scoreB: jogo?.score_b ?? 0,
      notes: jogo?.notes || '',
      craqueId: jogo?.craque_override || '',
      bagreId: jogo?.bagre_override || '',
      // só usados nas rodadas antigas, onde a data e os nomes ainda se mexem
      playedAt: jogo?.played_at || '',
      teamAName: jogo?.team_a_name || 'Amarelos',
      teamBName: jogo?.team_b_name || 'Azuis',
      stats,
      gk,
      jogou,
    }
  })

  // Quem jogou, seja qual for a origem: a escalação quando há sorteio, as
  // presenças marcadas à mão quando é uma rodada antiga.
  const participantes = useMemo(() => {
    if (!semEscalacao) {
      return escalacao.map((l) => ({ player_id: l.player_id, name: l.name, team: l.team }))
    }
    return Object.entries(form.jogou)
      .filter(([, v]) => v)
      .map(([id]) => ({
        player_id: id,
        name: jogadores?.find((j) => j.id === id)?.name || '—',
        team: form.stats[id]?.team || null,
      }))
  }, [semEscalacao, escalacao, form.jogou, form.stats, jogadores])

  // ---------- quem pode ser craque e quem pode ser bagre ----------
  // Lê o PLACAR QUE ESTÁ NO FORMULÁRIO, não o gravado: o admin muda o placar
  // e as listas mudam à frente dele, antes de guardar.
  const jogoDoFormulario = useMemo(
    () => ({ score_a: form.scoreA, score_b: form.scoreB, players: participantes }),
    [form.scoreA, form.scoreB, participantes],
  )
  const elegiveisCraque = candidatosCraque(jogoDoFormulario)
  const elegiveisBagre = candidatosBagre(jogoDoFormulario)
  const semLados = semLadosDefinidos(jogoDoFormulario)
  const escolhaInvalida =
    (form.craqueId && !elegiveisCraque.some((l) => l.player_id === form.craqueId)) ||
    (form.bagreId && !elegiveisBagre.some((l) => l.player_id === form.bagreId))

  const setStat = (id, campo, valor) =>
    setForm((f) => ({
      ...f,
      stats: {
        ...f.stats,
        [id]: { team: null, goals: 0, assists: 0, own: 0, ...f.stats[id], [campo]: valor },
      },
    }))

  // `alternar` liga e desliga a linha de baliza deste jogador: sem chave não
  // se grava linha nenhuma, e é isso que mantém o ranking de goleiros limpo
  // de quem passou dez minutos no gol.
  const setGk = (id, campo, valor) =>
    setForm((f) => {
      const gk = { ...f.gk }
      if (campo === 'alternar') {
        if (gk[id]) delete gk[id]
        else gk[id] = { saves: 0, conceded: 0 }
      } else {
        gk[id] = { ...(gk[id] || { saves: 0, conceded: 0 }), [campo]: valor }
      }
      return { ...f, gk }
    })

  const setJogou = (id, marcado) =>
    setForm((f) => {
      const jogou = { ...f.jogou, [id]: marcado }
      const stats = { ...f.stats }
      const gk = { ...f.gk }
      if (marcado) {
        if (!stats[id]) stats[id] = { team: null, goals: 0, assists: 0, own: 0 }
      } else {
        // Desmarcar tira o jogador da rodada — os números dele iam com ele
        // de qualquer forma, e deixá-los para trás fazia-os reaparecer se o
        // admin voltasse a marcar por engano.
        delete stats[id]
        delete gk[id]
      }
      return { ...f, jogou, stats, gk }
    })

  // ---------- cancelamento (dupla confirmação inline) ----------
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false)
  const [motivoCancelar, setMotivoCancelar] = useState('')
  // Fomos NÓS a encerrar agora? É o que decide mostrar o ecrã de sucesso com
  // a mensagem para o grupo, em vez de o mostrar a cada visita ao jogo.
  const [acabouDeEncerrar, setAcabouDeEncerrar] = useState(false)

  // ---------- histórico ----------
  const [atividade, setAtividade] = useState(null) // null = ainda não carregado

  // ---------- resenha do resultado (vai no post do feed) ----------
  const [resenha, setResenha] = useState('')
  // as sequências de ANTES desta rodada — get_matches ainda não a inclui,
  // que é exatamente o que "quebrou a invencibilidade" precisa
  const sequencias = useMemo(() => calcularSequencias(matches), [matches])
  const gerarResenha = useCallback(
    (tentativa) =>
      gerarResenhaResultado({
        jogo,
        resultado: {
          scoreA: form.scoreA,
          scoreB: form.scoreB,
          stats: Object.entries(form.stats).map(([player_id, s]) => ({ player_id, ...s })),
          // quem tem números de baliza nesta rodada — no rodízio pode não
          // ser ninguém, e a resenha simplesmente não fala de defesas
          gkStats: Object.entries(form.gk).map(([goalkeeper_id, g]) => ({
            goalkeeper_id,
            saves: g.saves || 0,
          })),
        },
        sequencias,
        tentativa,
      }),
    [jogo, form, sequencias]
  )

  // ---------- publicações deste jogo (editar/apagar) ----------
  const [posts, setPosts] = useState(null) // null = ainda não carregado
  // o filtro é do lado do servidor: filtrar aqui os últimos 50 do feed
  // deixava de encontrar os posts de jogos antigos assim que o feed crescesse
  const carregarPosts = () =>
    getFeed(50, null, jogo.id)
      .then((l) => setPosts(l || []))
      .catch((e) => setErro(e.message))

  const d = formatarDataDoJogo(jogo?.kickoff_at)

  const correr = async (fn, mensagem) => {
    if (submetendoRef.current) return
    submetendoRef.current = true
    setBusy(true)
    setErro('')
    try {
      const novo = await fn()
      if (novo?.id) onAtualizado?.(novo)
      if (mensagem) {
        setAviso(mensagem)
        setTimeout(() => setAviso(''), 3000)
      }
    } catch (e) {
      setErro(e.message)
    } finally {
      setBusy(false)
      submetendoRef.current = false
    }
  }

  // Nas rodadas antigas só entram os jogadores marcados; nas agendadas
  // entram todos os da escalação (o `form.stats` já nasce com eles).
  const linhasDeStats = () =>
    Object.entries(form.stats)
      .filter(([id]) => !semEscalacao || form.jogou[id])
      .map(([player_id, s]) => ({
        player_id,
        team: s.team || null,
        goals: s.goals || 0,
        assists: s.assists || 0,
        own_goals: s.own || 0,
      }))

  // A presença da chave em `form.gk` é que decide: sem ela, não há linha de
  // baliza para este jogador nesta rodada.
  const linhasDeGk = () =>
    Object.entries(form.gk)
      .filter(([id]) => !semEscalacao || form.jogou[id])
      .map(([goalkeeper_id, g]) => ({
        goalkeeper_id,
        team:
          escalacao.find((l) => l.player_id === goalkeeper_id)?.team ||
          form.stats[goalkeeper_id]?.team ||
          null,
        saves: g.saves || 0,
        goals_conceded: g.conceded || 0,
      }))

  // Uma rodada antiga grava-se pelo `admin_save_match`: é a única porta que
  // mexe na data e nos nomes das equipas, e a que trata das rodadas que nunca
  // tiveram agendamento. As fotos antigas (`winner_photo`/`location_photo`)
  // seguem inalteradas — passá-las vazias apagava-as.
  const guardarRodadaAntiga = () =>
    correr(async () => {
      await adminSaveMatch(pw, jogo.id, {
        playedAt: form.playedAt || jogo.played_at,
        teamAName: form.teamAName,
        teamBName: form.teamBName,
        scoreA: form.scoreA,
        scoreB: form.scoreB,
        winnerPhoto: jogo.winner_photo || null,
        locationPhoto: jogo.location_photo || null,
        notes: form.notes,
        stats: linhasDeStats(),
      })
      await adminSaveGkStats(pw, jogo.id, linhasDeGk())
      onAtualizado?.(null) // o payload novo vem do servidor, não daqui
      return null
    }, 'Rodada atualizada — as estatísticas foram recalculadas.')

  const guardarRascunho = () => {
    if (modoHistorico) return guardarRodadaAntiga()
    return correr(
      () =>
        adminSaveResult(pw, jogo.id, {
          scoreA: form.scoreA,
          scoreB: form.scoreB,
          stats: linhasDeStats(),
          gkStats: linhasDeGk(),
          notes: form.notes,
          craqueId: form.craqueId || null,
          bagreId: form.bagreId || null,
        }),
      fase === FASES.RESULTADO_PUBLICADO
        ? 'Resultado atualizado — as estatísticas foram recalculadas.'
        : 'Resultado guardado em rascunho. Só conta depois de publicares.'
    )
  }

  const publicarResultado = async () => {
    if (
      !window.confirm(
        `Publicar o resultado ${form.scoreA}–${form.scoreB}? A partir daqui conta nas estatísticas e aparece a todos.`
      )
    )
      return
    // guarda primeiro o que está no ecrã, depois publica — senão publicava-se
    // um rascunho antigo diferente do que o admin está a ver
    await correr(async () => {
      await adminSaveResult(pw, jogo.id, {
        scoreA: form.scoreA,
        scoreB: form.scoreB,
        stats: linhasDeStats(),
        gkStats: linhasDeGk(),
        notes: form.notes,
        craqueId: form.craqueId || null,
        bagreId: form.bagreId || null,
      })
      const novo = await adminPublishResult(pw, jogo.id, resenha)
      // a secção de publicações, se já estiver aberta, ganha o post novo
      if (posts !== null) await carregarPosts()
      return novo
    }, 'Resultado publicado! 🎉')
  }

  // ---------- encerrar o jogo ----------
  //
  // Eram cinco passos para uma decisão só ("o jogo acabou"): preencher →
  // guardar rascunho → publicar → ir à secção da avaliação → abrir. E a
  // votação de craque/bagre nem interruptor tinha. Agora é um botão que faz
  // tudo numa transação e devolve já a mensagem para o grupo.
  const encerrarJogo = async () => {
    const prazo = prazoPorOmissao(jogo?.kickoff_at)
    if (
      !window.confirm(
        `Encerrar o jogo com ${form.scoreA}–${form.scoreB}?\n\n` +
          '• o resultado é publicado e passa a contar\n' +
          '• abre a votação (estrelas + craque + bagre)\n' +
          `• a votação fecha ${prazoLegivel(prazo?.toISOString())}`
      )
    )
      return
    await correr(async () => {
      const novo = await adminCloseGame(pw, jogo.id, {
        scoreA: form.scoreA,
        scoreB: form.scoreB,
        stats: linhasDeStats(),
        gkStats: linhasDeGk(),
        notes: form.notes,
        resenha,
        deadline: prazo ? prazo.toISOString() : null,
      })
      if (posts !== null) await carregarPosts()
      setAcabouDeEncerrar(true)
      return novo
    }, 'Jogo encerrado e votação aberta! 🎉')
  }

  const partilharVotacao = async (copiarSo) => {
    const url = urlDaVotacao(jogo.id)
    const texto = mensagemDeVotacao(
      { ...jogo, score_a: form.scoreA, score_b: form.scoreB },
      url
    )
    const r = copiarSo ? await copiarTexto(texto) : await partilharTexto(texto)
    if (r === 'copiado' || r === 'manual') setAviso('Mensagem copiada — cola no grupo.')
    else if (r === 'whatsapp') setAviso('Abri o WhatsApp com o convite para votar.')
    setTimeout(() => setAviso(''), 3000)
  }

  const cancelarJogo = () =>
    correr(async () => {
      const novo = await adminCancelMatch(pw, jogo.id, motivoCancelar)
      setConfirmandoCancelar(false)
      if (posts !== null) await carregarPosts()
      return novo
    }, 'Jogo cancelado. Fica no histórico, fora das estatísticas.')

  const apagarJogo = async () => {
    if (!window.confirm('Apagar este jogo? Só é possível em rascunho ou cancelado, e não há volta.'))
      return
    setBusy(true)
    setErro('')
    try {
      await adminDeleteSchedule(pw, jogo.id)
      onApagado?.(jogo.id)
    } catch (e) {
      setErro(e.message)
      setBusy(false)
    }
  }

  const carregarAtividade = () =>
    adminMatchActivity(pw, jogo.id)
      .then((l) => setAtividade(l || []))
      .catch((e) => setErro(e.message))

  const adicionarFoto = async (e, kind) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permitir escolher a mesma foto outra vez
    if (!file) return
    setBusy(true)
    setErro('')
    try {
      const data = await fileToDataURL(file)
      const semFotos = !(jogo.media || []).length
      await adminAddMedia(pw, jogo.id, kind, data, semFotos) // a primeira fica principal
      // as funções de media não devolvem o jogo — pede-se ao pai que recarregue
      onAtualizado?.(null)
      setAviso('Foto adicionada.')
      setTimeout(() => setAviso(''), 2500)
    } catch (e2) {
      setErro(e2.message)
    } finally {
      setBusy(false)
    }
  }

  const nomeDe = (id) => escalacao.find((l) => l.player_id === id)?.name || jogadores?.find((j) => j.id === id)?.name || '—'

  // ---------- "vais jogar?" ----------
  // Quem NÃO respondeu não aparece em lado nenhum: silêncio não é um "não".
  const respostas = Array.isArray(jogo?.availability) ? jogo.availability : []
  const vem = respostas.filter((r) => r.available)
  const naoVem = respostas.filter((r) => !r.available)

  // ---------- render ----------
  return (
    <div className="pb-stack">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={onVoltar} style={{ ...styles.buttonGhost, width: 'auto', padding: '8px 14px' }}>
          ← Jogos
        </button>
        <FaseChip fase={fase} />
        {aviso && (
          <span role="status" style={{ color: colors.grass, fontSize: 13 }}>
            ✅ {aviso}
          </span>
        )}
      </div>

      {erro && <ErrorBox>{erro}</ErrorBox>}

      {/* ---------- cabeçalho ---------- */}
      <div className="pb-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div className="pb-break" style={{ fontFamily: fonts.title, fontSize: 20, lineHeight: 1.2 }}>
              {jogo.location || (semEscalacao ? 'Rodada antiga' : 'Local por definir')}
            </div>
            {/* Uma rodada antiga só tem `played_at` (data, sem hora): sem este
                recurso mostrava "Data por definir" a um jogo que já se jogou. */}
            <div style={{ ...styles.mutedText, fontSize: 13, marginTop: 4 }}>
              {d.hora
                ? `${d.diaDaSemana}, ${d.data} às ${d.hora}`
                : jogo.played_at
                  ? formatarDataDoJogo(jogo.played_at).data
                  : 'Data por definir'}
            </div>
          </div>
          {(jogo.team_a_overall || jogo.team_b_overall) && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
              <span style={{ color: corDaEquipa('A'), fontFamily: fonts.title, fontSize: 18 }}>
                ⚫ {jogo.team_a_overall ?? '—'}
              </span>
              <span style={{ color: colors.muted, fontSize: 12 }}>vs</span>
              <span style={{ color: corDaEquipa('B'), fontFamily: fonts.title, fontSize: 18 }}>
                ⚪ {jogo.team_b_overall ?? '—'}
              </span>
            </div>
          )}
        </div>
        <Timeline fase={fase} />
        {fase === FASES.CANCELADO && (
          <p style={{ fontSize: 13, color: colors.error, marginTop: 10 }}>
            🚫 Cancelado{jogo.cancel_reason ? ` — ${jogo.cancel_reason}` : ''}. Não conta nas
            estatísticas; fica no histórico.
          </p>
        )}
      </div>

      {/* ---------- quem disse que vem ---------- */}
      {/* Só faz sentido antes de o jogo acontecer: depois de haver resultado,
          quem jogou é o que está na escalação, não quem prometeu vir. */}
      {respostas.length > 0 && fase !== FASES.RESULTADO_PUBLICADO && fase !== FASES.CANCELADO && (
        <Seccao titulo={`Disponibilidade (${vem.length} vêm · ${naoVem.length} não vêm)`}>
          <div className="pb-split" style={{ '--pb-split-min': '260px' }}>
            {[
              { titulo: '✅ Vêm', lista: vem, cor: colors.grass },
              { titulo: '❌ Não vêm', lista: naoVem, cor: colors.error },
            ].map(({ titulo, lista, cor }) => (
              <div key={titulo} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: cor, letterSpacing: 1, marginBottom: 6 }}>
                  {titulo} ({lista.length})
                </div>
                {lista.length === 0 ? (
                  <p style={{ ...styles.mutedText, fontSize: 12 }}>Ninguém.</p>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {lista.map((r) => (
                      <li
                        key={r.player_id}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}
                      >
                        <Avatar name={r.name} photo={r.photo} size={24} />
                        <span className="pb-truncate" style={{ flex: 1, fontSize: 13, minWidth: 0 }}>
                          {r.name}
                        </span>
                        {r.is_member && (
                          <span aria-label="mensalista" title="Mensalista" style={{ flexShrink: 0 }}>
                            ⭐
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Seccao>
      )}

      {/* ---------- equipas ---------- */}
      {escalacao.length > 0 ? (
        <Seccao titulo={`Equipas (${escalacao.length} jogadores)`}>
          <FootballPitch lineup={escalacao} showOverall />
          {acoes.substituir && (
            <button
              type="button"
              onClick={onAbrirDesistencias}
              style={{ ...styles.buttonGhost, marginTop: 12 }}
            >
              🔄 Registar desistência / substituir
            </button>
          )}
        </Seccao>
      ) : (
        <Seccao titulo="Equipas">
          <p style={styles.mutedText}>
            {modoHistorico
              ? 'Esta rodada não passou pelo sorteio — as equipas são as que estiverem marcadas em baixo, no resultado.'
              : 'Ainda não há sorteio para este jogo.'}
          </p>
          {acoes.sortear && (
            <button type="button" onClick={onAbrirAssistente} style={{ ...styles.button, marginTop: 12 }}>
              🎲 Sortear no assistente
            </button>
          )}
        </Seccao>
      )}

      {/* ---------- resultado ---------- */}
      {acoes.preencherResultado && (
        <Seccao
          titulo={fase === FASES.RESULTADO_PUBLICADO ? 'Editar resultado (já publicado)' : 'Resultado'}
          tom={fase === FASES.AGUARDA_RESULTADO ? colors.teamA : undefined}
        >
          {fase === FASES.RESULTADO_PUBLICADO && (
            <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 10 }}>
              As linhas deste jogo são regravadas ao guardar — as estatísticas recalculam sem
              duplicar nada.
            </p>
          )}

          {/* Data e nomes das equipas — só nas rodadas antigas. Num jogo
              agendado a data vem da agenda e os nomes são fixos (Pretos e
              Brancos), por isso não há aqui nada para escrever. */}
          {modoHistorico && (
            <div className="pb-split" style={{ '--pb-split-min': '260px', marginBottom: 14 }}>
              <div>
                <label style={styles.label} htmlFor="rodada-data">
                  Data do jogo
                </label>
                <input
                  id="rodada-data"
                  type="date"
                  style={styles.input}
                  value={form.playedAt || ''}
                  onChange={(e) => setForm((f) => ({ ...f, playedAt: e.target.value }))}
                />
              </div>
              <div className="pb-split" style={{ '--pb-split-min': '120px', columnGap: 8 }}>
                <div>
                  <label style={{ ...styles.label, color: corDaEquipa('A') }} htmlFor="rodada-a">
                    Nome do time A
                  </label>
                  <input
                    id="rodada-a"
                    style={styles.input}
                    value={form.teamAName}
                    onChange={(e) => setForm((f) => ({ ...f, teamAName: e.target.value }))}
                    placeholder="Amarelos"
                  />
                </div>
                <div>
                  <label style={{ ...styles.label, color: corDaEquipa('B') }} htmlFor="rodada-b">
                    Nome do time B
                  </label>
                  <input
                    id="rodada-b"
                    style={styles.input}
                    value={form.teamBName}
                    onChange={(e) => setForm((f) => ({ ...f, teamBName: e.target.value }))}
                    placeholder="Azuis"
                  />
                </div>
              </div>
            </div>
          )}

          {/* placar */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'end', marginBottom: 14 }}>
            {[
              { lado: 'A', campo: 'scoreA' },
              { lado: 'B', campo: 'scoreB' },
            ].map(({ lado, campo }) => (
              <div key={lado} style={{ flex: 1 }}>
                <label style={styles.label} htmlFor={`placar-${lado}`}>
                  {nomeDaEquipa(lado)}
                </label>
                <input
                  id={`placar-${lado}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={99}
                  style={{ ...styles.input, textAlign: 'center', fontFamily: fonts.title, fontSize: 24 }}
                  value={form[campo]}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      [campo]: Math.max(0, Math.min(99, Number(e.target.value) || 0)),
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <p style={{ ...styles.mutedText, fontSize: 12, marginTop: -6, marginBottom: 12 }}>
            {form.scoreA === form.scoreB
              ? '🤝 Empate'
              : `🏆 Vencem os ${form.scoreA > form.scoreB ? nomeDaEquipa('A') : nomeDaEquipa('B')}`}
          </p>

          {/* A lista de jogadores e os contadores vivem no `ResultadoForm` —
              o mesmo componente que as rodadas antigas usam. */}
          <ResultadoForm
            jogo={jogo}
            escalacao={escalacao}
            plantel={jogadores}
            form={form}
            onStat={setStat}
            onGk={setGk}
            onJogou={setJogou}
          />

          {/* craque e bagre — a votação decide; isto é a correção do admin.
              As listas seguem a MESMA regra da votação: craque entre os
              vencedores, bagre entre os derrotados. Corrigir à mão o que a
              votação proíbe era o buraco por onde a regra fugia — e o
              servidor recusa na mesma (CRAQUEPERDEDOR / BAGREVENCEDOR). */}
          <div className="pb-cards" style={{ gap: 10, marginBottom: 12 }}>
            {[
              { campo: 'craqueId', rotulo: '👑 Craque (correção)', id: 'craque-sel', lista: elegiveisCraque },
              { campo: 'bagreId', rotulo: '🐟 Bagre (correção)', id: 'bagre-sel', lista: elegiveisBagre },
            ].map(({ campo, rotulo, id, lista }) => (
              <div key={campo}>
                <label style={styles.label} htmlFor={id}>
                  {rotulo}
                </label>
                <select
                  id={id}
                  style={styles.input}
                  value={form[campo]}
                  onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value }))}
                >
                  <option value="">— a votação decide —</option>
                  {lista.map((l) => (
                    <option key={l.player_id} value={l.player_id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <p style={{ ...styles.mutedText, fontSize: 11, marginTop: -6, marginBottom: 12 }}>
            O craque e o bagre continuam a ser decididos pela votação do grupo. Preenche isto só
            para desempatar ou corrigir — e fica registado no histórico do jogo.
            {semLados
              ? ' Sem vencedor definido no placar, concorre toda a gente.'
              : ` Com este placar, só os ${nomeDaEquipa(ladoVencedor({ score_a: form.scoreA, score_b: form.scoreB }))} concorrem a craque.`}
          </p>
          {escolhaInvalida && (
            <p style={{ ...styles.errorText, marginTop: -6, marginBottom: 12 }}>
              A correção escolhida já não é válida para este placar — o servidor vai recusá-la.
              Escolhe outra pessoa (ou deixa a votação decidir).
            </p>
          )}

          <label style={styles.label} htmlFor="obs-jogo">
            Observações (opcional)
          </label>
          <textarea
            id="obs-jogo"
            rows={2}
            style={{ ...styles.input, resize: 'vertical', marginBottom: 12 }}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Resenha, casos do jogo…"
          />

          {/* a resenha só interessa quando a publicação ainda vai acontecer */}
          {fase !== FASES.RESULTADO_PUBLICADO && !modoHistorico && (
            <div style={{ margin: '2px 0 14px', borderTop: `1px solid ${colors.line}`, paddingTop: 14 }}>
              <ResenhaEditor gerar={gerarResenha} onChange={setResenha} inicial={resenha} />
            </div>
          )}

          {modoHistorico && (
            <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 10 }}>
              ℹ️ Rodada antiga: guardar regrava as linhas desta rodada e as estatísticas
              recalculam. Não há sorteio nem votação para abrir.
            </p>
          )}

          {/* O caminho normal é UM botão. Publicar o resultado sem abrir a
              votação continua a existir, mas passa a ser a opção secundária:
              era esse o passo que toda a gente esquecia. */}
          {fase !== FASES.RESULTADO_PUBLICADO && !modoHistorico && jogo.overall_version === 2 && (
            <button
              type="button"
              onClick={encerrarJogo}
              disabled={busy}
              style={busy ? disabled({ ...styles.button }) : styles.button}
            >
              {busy ? 'A encerrar…' : '⏹ Encerrar jogo e abrir a votação'}
            </button>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <button
              type="button"
              onClick={guardarRascunho}
              disabled={busy}
              style={busy ? disabled({ ...styles.buttonGhost, flex: '1 1 150px', width: 'auto' }) : { ...styles.buttonGhost, flex: '1 1 150px', width: 'auto' }}
            >
              {busy ? 'A guardar…' : fase === FASES.RESULTADO_PUBLICADO ? '💾 Guardar alterações' : '💾 Guardar rascunho'}
            </button>
            {fase !== FASES.RESULTADO_PUBLICADO && !modoHistorico && (
              <button
                type="button"
                onClick={publicarResultado}
                disabled={busy}
                style={
                  busy
                    ? disabled({ ...styles.buttonGhost, flex: '1 1 150px', width: 'auto' })
                    : { ...styles.buttonGhost, flex: '1 1 150px', width: 'auto' }
                }
              >
                {busy ? 'A publicar…' : '📢 Só publicar resultado'}
              </button>
            )}
          </div>
        </Seccao>
      )}

      {/* ---------- votação da rodada ---------- */}
      {/* Era só um interruptor para as estrelas — o craque/bagre não tinha
          controlo nenhum, nem prazo, nem forma de saber quem faltava. Agora
          é um painel com prazo, participação, link para o grupo e a revisão
          quando falta quórum ou há empate. Só em jogos da versão nova da
          fórmula: o passado não se reavalia. */}
      {jogo.result_status === 'PUBLISHED' && jogo.overall_version === 2 && (
        <Seccao titulo="Votação da rodada" tom={jogo.voting_status === 'REVIEW' ? colors.teamA : undefined}>
          {acabouDeEncerrar && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 10,
                background: 'rgba(52,208,88,0.10)',
                border: `1px solid ${colors.grass}55`,
                marginBottom: 14,
              }}
            >
              <div style={{ ...styles.title, fontSize: 15, marginBottom: 6 }}>
                ✅ Jogo encerrado — votação aberta
              </div>
              <p style={{ ...styles.mutedText, fontSize: 13, marginBottom: 10 }}>
                Falta o passo que faz a diferença: mandar o link ao grupo.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => partilharVotacao(true)}
                  style={{ ...styles.buttonGhost, flex: '1 1 140px', width: 'auto' }}
                >
                  📋 Copiar mensagem
                </button>
                <button
                  type="button"
                  onClick={() => partilharVotacao(false)}
                  style={{ ...styles.button, flex: '1 1 140px', width: 'auto' }}
                >
                  🟢 Enviar no WhatsApp
                </button>
              </div>
            </div>
          )}
          <VotingPanel pw={pw} jogo={jogo} onAtualizado={onAtualizado} />
        </Seccao>
      )}

      {/* ---------- fotos ---------- */}
      {(acoes.preencherResultado || (jogo.media || []).length > 0) && (
        <Seccao titulo={`Fotos (${(jogo.media || []).length})`}>
          {(jogo.media || []).length > 0 && (
            <div className="pb-cards-sm" style={{ marginBottom: 12 }}>
              {jogo.media.map((m) => (
                <figure key={m.id} style={{ margin: 0, position: 'relative' }}>
                  <img
                    src={m.data_url}
                    alt={m.kind === 'WINNER' ? 'Foto do time vencedor' : 'Foto do jogo'}
                    style={{
                      width: '100%',
                      aspectRatio: '4 / 3',
                      objectFit: 'cover',
                      borderRadius: 10,
                      border: `2px solid ${m.is_primary ? colors.grass : colors.line}`,
                      display: 'block',
                    }}
                  />
                  <figcaption style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                    {m.is_primary ? (
                      <span style={chip(colors.grass, `${colors.grass}1A`)}>★ principal</span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          correr(async () => {
                            await adminSetPrimaryMedia(pw, m.id)
                            onAtualizado?.(null)
                            return null
                          })
                        }
                        style={{ background: 'none', border: 'none', color: colors.muted, fontSize: 12, textDecoration: 'underline' }}
                      >
                        tornar principal
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm('Apagar esta foto?')) return
                        correr(async () => {
                          await adminDeleteMedia(pw, m.id)
                          onAtualizado?.(null)
                          return null
                        })
                      }}
                      style={{ background: 'none', border: 'none', color: colors.error, fontSize: 12, textDecoration: 'underline', marginLeft: 'auto' }}
                    >
                      apagar
                    </button>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
          {acoes.preencherResultado && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ ...styles.buttonGhost, width: 'auto', flex: '1 1 160px', textAlign: 'center', cursor: 'pointer' }}>
                🏆 Foto dos vencedores
                <input type="file" accept="image/*" onChange={(e) => adicionarFoto(e, 'WINNER')} style={{ display: 'none' }} />
              </label>
              <label style={{ ...styles.buttonGhost, width: 'auto', flex: '1 1 160px', textAlign: 'center', cursor: 'pointer' }}>
                📷 Outra foto
                <input type="file" accept="image/*" onChange={(e) => adicionarFoto(e, 'PHOTO')} style={{ display: 'none' }} />
              </label>
            </div>
          )}
        </Seccao>
      )}

      {/* ---------- histórico ---------- */}
      <Seccao titulo="Histórico do jogo">
        {atividade === null ? (
          <button type="button" onClick={carregarAtividade} style={{ ...styles.buttonGhost, width: 'auto', padding: '8px 14px' }}>
            📜 Ver histórico
          </button>
        ) : atividade.length === 0 ? (
          <p style={styles.mutedText}>Sem registos ainda — a auditoria começou na migração 0019.</p>
        ) : (
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {atividade.map((a) => {
              const t = atividadeLegivel(a)
              const dq = formatarDataDoJogo(t.quando)
              return (
                <li key={a.id} style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'baseline' }}>
                  <span aria-hidden style={{ flexShrink: 0 }}>{t.icone}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>{t.texto}</span>
                  <span style={{ color: colors.muted, fontSize: 11, flexShrink: 0 }}>
                    {dq.hora ? `${dq.data} ${dq.hora}` : ''}
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      </Seccao>

      {/* ---------- publicações deste jogo no feed ---------- */}
      <Seccao titulo="Publicações no feed">
        {posts === null ? (
          <button type="button" onClick={carregarPosts} style={{ ...styles.buttonGhost, width: 'auto', padding: '8px 14px' }}>
            📰 Ver publicações
          </button>
        ) : posts.length === 0 ? (
          <p style={styles.mutedText}>
            Este jogo ainda não tem publicações — elas nascem ao publicar o sorteio e o resultado.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {posts.map((p) => (
              <PostDoJogo
                key={p.id}
                post={p}
                busy={busy}
                onGuardar={(titulo, corpo) =>
                  correr(async () => {
                    await adminUpdatePost(pw, p.id, titulo, corpo)
                    await carregarPosts()
                    return null
                  }, 'Publicação atualizada.')
                }
                onApagar={() => {
                  // os posts de SORTEIO/RESULTADO nascem no ato de publicar e
                  // não há como os re-emitir — apagar é para sempre
                  if (
                    !window.confirm(
                      p.type === 'SORTEIO' || p.type === 'RESULTADO'
                        ? 'Apagar esta publicação do feed? Não há forma de a recriar — o jogo desaparece do feed de vez. Para corrigir o texto usa "Editar".'
                        : 'Apagar esta publicação do feed? Os dados do jogo ficam.'
                    )
                  )
                    return
                  correr(async () => {
                    await adminDeletePost(pw, p.id)
                    await carregarPosts()
                    return null
                  }, 'Publicação apagada.')
                }}
              />
            ))}
          </ul>
        )}
      </Seccao>

      {/* ---------- zona de perigo ---------- */}
      {(acoes.cancelar || acoes.apagar) && (
        <Seccao titulo="Zona de perigo" tom={colors.error}>
          {acoes.cancelar && !confirmandoCancelar && (
            <button
              type="button"
              onClick={() => setConfirmandoCancelar(true)}
              style={{ ...styles.buttonGhost, color: colors.error, borderColor: colors.error }}
            >
              🚫 Cancelar jogo
            </button>
          )}
          {acoes.cancelar && confirmandoCancelar && (
            <div>
              <p style={{ fontSize: 14, marginBottom: 10 }}>
                Tem a certeza? O jogo <strong>sai das estatísticas</strong> mas fica no histórico
                como cancelado. Os jogadores deixam de o ver como próximo jogo.
              </p>
              <label style={styles.label} htmlFor="motivo-cancel">
                Motivo (opcional, fica visível)
              </label>
              <input
                id="motivo-cancel"
                style={{ ...styles.input, marginBottom: 10 }}
                value={motivoCancelar}
                onChange={(e) => setMotivoCancelar(e.target.value)}
                placeholder="Chuva, campo indisponível…"
                maxLength={120}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {/* o caminho seguro é o primário */}
                <button
                  type="button"
                  onClick={() => setConfirmandoCancelar(false)}
                  style={{ ...styles.button, flex: '2 1 140px', width: 'auto' }}
                >
                  ← Voltar
                </button>
                <button
                  type="button"
                  onClick={cancelarJogo}
                  disabled={busy}
                  style={{
                    ...styles.buttonGhost,
                    flex: '1 1 180px',
                    width: 'auto',
                    color: '#fff',
                    background: colors.error,
                    borderColor: colors.error,
                    ...(busy ? { opacity: 0.4 } : {}),
                  }}
                >
                  {busy ? 'A cancelar…' : 'Confirmar cancelamento'}
                </button>
              </div>
            </div>
          )}
          {acoes.apagar && (
            <button
              type="button"
              onClick={apagarJogo}
              disabled={busy}
              style={{ ...styles.buttonGhost, color: colors.error, borderColor: colors.error, marginTop: acoes.cancelar ? 10 : 0 }}
            >
              🗑️ Apagar {fase === FASES.CANCELADO ? 'jogo cancelado' : 'rascunho'}
            </button>
          )}
          <p style={{ ...styles.mutedText, fontSize: 11, marginTop: 10 }}>
            Jogos com resultado publicado não se cancelam nem se apagam — são história.
          </p>
        </Seccao>
      )}

      {/* nomes usados nos overrides, para o admin confirmar o que lá está */}
      {(jogo.craque_override || jogo.bagre_override) && (
        <p style={{ ...styles.mutedText, fontSize: 12 }}>
          Correções ativas: {jogo.craque_override ? `craque → ${nomeDe(jogo.craque_override)}` : ''}
          {jogo.craque_override && jogo.bagre_override ? ' · ' : ''}
          {jogo.bagre_override ? `bagre → ${nomeDe(jogo.bagre_override)}` : ''}
        </p>
      )}
    </div>
  )
}
