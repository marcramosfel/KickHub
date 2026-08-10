import { useMemo, useState } from 'react'
import {
  adminMatchesUpcoming,
  adminPending,
  adminReject,
  adminUsers,
  getFeed,
  getGoalkeeperStats,
  getMatchCall,
  getMatches,
  getPlayers,
  getPlayerStats,
} from '../api'
import { juntarEstatisticas } from '../lib/ranking'
import { jogosComResultadoPendente } from '../lib/lifecycle'
import { estadoDaVotacao } from '../lib/voting'
import { ADMIN_NAME } from '../config'
import AdminNav from './admin/AdminNav'
import AdminOverview from './admin/AdminOverview'
import AcessosPanel from './admin/AcessosPanel'
import FaltasPanel from './admin/FaltasPanel'
import GamesPanel from './admin/GamesPanel'
import MatchWizard from './admin/MatchWizard'
import PedidosPanel from './admin/PedidosPanel'
import PlantelPanel from './admin/PlantelPanel'
import PositionsAdmin from './admin/PositionsAdmin'
import QuickDraw from './admin/QuickDraw'
import RodadasPanel from './admin/RodadasPanel'
import SubstitutionsPanel from './admin/SubstitutionsPanel'
import { colors, fonts, styles, disabled } from '../theme'

export default function AdminScreen({ onExit }) {
  const [pw, setPw] = useState('')
  const [authed, setAuthed] = useState(false)
  const [tab, setTab] = useState('visao') // ver GRUPOS em admin/AdminNav.jsx

  // aba "Novo sorteio": qual dos dois modos está à vista, e as EQUIPAS do
  // rachão quando ele sobe a jogo oficial (dois arrays de ids)
  const [modoSorteio, setModoSorteio] = useState('completo')
  const [conversao, setConversao] = useState(null)

  const [pending, setPending] = useState([])
  const [players, setPlayers] = useState([])
  // números de campo e de baliza — o assistente do jogo precisa do overall
  const [playerStats, setPlayerStats] = useState([])
  const [gkStats, setGkStats] = useState(null)
  // defesas/gols sofridos da rodada a registar: { [id]: { saves, conceded } }

  // rodadas / estatísticas
  const [matches, setMatches] = useState([])
  const [matchesErr, setMatchesErr] = useState('')
  // A convocatória do próximo jogo: quem já disse que vem. Alimenta o
  // assistente do sorteio (passo 2) e a visão geral.
  const [convocatoria, setConvocatoria] = useState(null)

  // jogos do ciclo novo (0016+): alimenta o badge da aba "Jogos"
  const [jogosAbertos, setJogosAbertos] = useState([])
  // ultimas publicacoes, so para a visao geral
  const [feedAdmin, setFeedAdmin] = useState([])
  // jogo que a visao geral mandou abrir na aba Jogos
  const [jogoAberto, setJogoAberto] = useState(null)

  // utilizadores / IDs
  const [users, setUsers] = useState([])
  const [usersErr, setUsersErr] = useState('')

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = async (senha = pw) => {
    const [pend, pls, chamada, ps, gk] = await Promise.all([
      adminPending(senha),
      getPlayers(),
      // não-fatais: sem as migrações 0002/0017 (e a da convocatória) o resto
      // do admin funciona na mesma
      getMatchCall().catch(() => null),
      getPlayerStats().catch(() => []),
      getGoalkeeperStats().catch(() => null),
    ])
    setPending(pend || [])
    setPlayers(pls || [])
    setConvocatoria(chamada)
    setPlayerStats(ps || [])
    setGkStats(gk)
    // rodadas (não-fatal: sem a migração 0002 o resto do admin continua a funcionar)
    getMatches()
      .then((m) => {
        setMatches(m || [])
        setMatchesErr('')
      })
      .catch((err) => setMatchesErr(err.message))
    // utilizadores/IDs (não-fatal: sem a migração 0008 esta aba mostra o aviso)
    adminUsers(senha)
      .then((u) => {
        setUsers(u || [])
        setUsersErr('')
      })
      .catch((err) => setUsersErr(err.message))
    // jogos abertos, para o badge de resultados pendentes na aba "Jogos"
    // (não-fatal: sem a 0016 a aba mostra o seu próprio aviso)
    adminMatchesUpcoming(senha)
      .then((l) => setJogosAbertos(l || []))
      .catch(() => setJogosAbertos([]))
    // ultimas publicacoes para a visao geral (nao-fatal: sem a 0020 nao ha feed)
    getFeed(3)
      .then((l) => setFeedAdmin(l || []))
      .catch(() => setFeedAdmin([]))
  }

  const entrar = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await refresh(pw) // admin_pending valida a senha (erro ADMIN se errada)
      setAuthed(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const acao = async (fn) => {
    setError('')
    setBusy(true)
    try {
      await fn()
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const rejeitar = (p, verbo) => {
    if (!window.confirm(`${verbo} ${p.name}? Esta ação apaga a conta e os votos.`)) return
    acao(() => adminReject(pw, p.id))
  }

  // Jogadores já com overall (de campo ou de baliza) e posições — é isto que
  // o assistente do jogo usa para equilibrar as equipas.
  const jogadores = useMemo(
    () =>
      juntarEstatisticas({
        players,
        playerStats,
        goalkeeperStats: gkStats,
        resultados: matches,
      }),
    [players, playerStats, gkStats, matches]
  )

  // ---------- ecrã de senha ----------
  if (!authed) {
    return (
      <div style={styles.page}>
        <div style={{ textAlign: 'center', margin: '40px 0 24px' }}>
          <div style={{ fontSize: 34, marginBottom: 6 }}>🔐</div>
          <h1 style={{ ...styles.title, fontSize: 24 }}>Área do admin</h1>
          <p style={{ ...styles.mutedText, marginTop: 6 }}>{ADMIN_NAME}</p>
        </div>
        <form onSubmit={entrar} style={styles.panel}>
          <label style={styles.label}>Senha de admin</label>
          <input
            style={styles.input}
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Senha"
            autoComplete="off"
          />
          <button
            type="submit"
            style={busy ? disabled({ ...styles.button, marginTop: 16 }) : { ...styles.button, marginTop: 16 }}
            disabled={busy}
          >
            {busy ? 'A verificar…' : 'Entrar'}
          </button>
          {error && <p style={styles.errorText}>{error}</p>}
        </form>
        <div style={{ textAlign: 'center', marginTop: 22 }}>
          <button onClick={onExit} style={styles.link}>
            Voltar
          </button>
        </div>
      </div>
    )
  }

  // jogadores ainda sem posição: o sorteio posicional não os coloca bem
  const semPosicao = jogadores.filter((j) => !j.primaryPosition).length
  // jogos cuja hora já passou e continuam sem resultado publicado
  const resultadosPendentes = jogosComResultadoPendente(jogosAbertos).length
  // votações que expiraram sem quórum (ou com empate) e esperam decisão —
  // sem badge, ficavam esquecidas e a rodada nunca chegava a contar
  const votacoesEmRevisao = jogosAbertos.filter((j) => estadoDaVotacao(j).emRevisao).length

  // ---------- tabs ----------
  // Contadores da navegação e da visão geral, num sítio só.
  const badges = {
    resultadosPendentes: resultadosPendentes + votacoesEmRevisao,
    pedidos: pending.length,
    semPosicao,
  }

  const escolherAba = (id) => {
    setTab(id)
    setError('')
    // as equipas de um rachão valem para o jogo que se está a marcar agora
    setConversao(null)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    // `pb-container` em vez do `styles.page` de 480px: o painel de admin é
    // onde há listas, tabelas e formulários lado a lado — apertá-lo a meia
    // largura no computador era desperdiçar o ecrã todo.
    <div className="pb-container" style={{ padding: '20px 16px 40px', minHeight: '100vh' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1 style={{ ...styles.title, fontSize: 22 }}>
            Admin <span style={{ color: colors.grass }}>⚖️</span>
          </h1>
          <p style={{ ...styles.mutedText, fontSize: 13, marginTop: 2 }}>{ADMIN_NAME}</p>
        </div>
        {/* "Sair" são quatro letras: sem a padding lateral o alvo tinha 24px de
            largura, encostado ao canto do ecrã. */}
        <button
          onClick={onExit}
          style={{ ...styles.link, minHeight: 44, padding: '10px 14px', flexShrink: 0 }}
        >
          Sair
        </button>
      </div>

      {/* telemóvel e tablet: fila que rola dentro do próprio bloco */}
      <div className="pb-hide-desktop">
        <AdminNav tab={tab} badges={badges} onEscolher={escolherAba} />
      </div>

      {error && <p style={{ ...styles.errorText, marginBottom: 12 }}>{error}</p>}

      <div className="pb-grid">
        {/* desktop: barra lateral fixa, sempre à vista */}
        <div className="pb-col-3 pb-only-desktop">
          <div style={{ position: 'sticky', top: 16 }}>
            <AdminNav tab={tab} badges={badges} onEscolher={escolherAba} lateral />
          </div>
        </div>

        <div className="pb-col-9 pb-col-md-12" style={{ minWidth: 0 }}>
      {/* ---------- VISÃO GERAL ---------- */}
      {tab === 'visao' && (
        <AdminOverview
          jogosAbertos={jogosAbertos}
          jogadores={jogadores}
          pedidos={pending}
          feed={feedAdmin}
          convocatoria={convocatoria}
          onIr={escolherAba}
          onAbrirJogo={(id) => {
            setJogoAberto(id)
            escolherAba('jogos-ciclo')
          }}
        />
      )}

      {/* ---------- PEDIDOS ---------- */}
      {tab === 'pedidos' && (
        <PedidosPanel pw={pw} pedidos={pending} busy={busy} onAcao={acao} />
      )}

      {/* ---------- JOGOS (ciclo de vida completo, um jogo = uma página) ---------- */}
      {tab === 'jogos-ciclo' && (
        <GamesPanel
          pw={pw}
          jogadores={jogadores}
          matches={matches}
          abrirId={jogoAberto}
          onAbertoConsumido={() => setJogoAberto(null)}
          onAbrirAssistente={() => {
            setModoSorteio('completo')
            setTab('novo')
          }}
          onAbrirDesistencias={() => setTab('desistencias')}
        />
      )}

      {/* ---------- NOVO SORTEIO (completo = jogo oficial · rápido = rachão) ---------- */}
      {tab === 'novo' && (
        <div>
          <div className="pb-cards" style={{ gap: 10, marginBottom: 14 }}>
            {[
              {
                id: 'completo',
                titulo: '⚽ Sorteio completo',
                texto: 'O jogo oficial: data e local, 2 goleiros + 12 de campo, posições 2-3-1, equilíbrio por overall, publicação com resenha.',
              },
              {
                id: 'rapido',
                titulo: '🎲 Sorteio rápido',
                texto: 'O rachão: qualquer número de jogadores, 2 a 4 equipas, aleatório ou equilibrado, sem agendamento.',
              },
            ].map((m) => {
              const ativo = modoSorteio === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModoSorteio(m.id)}
                  aria-pressed={ativo}
                  className="pb-card"
                  style={{
                    textAlign: 'left',
                    font: 'inherit',
                    color: colors.text,
                    cursor: 'pointer',
                    borderColor: ativo ? colors.grass : colors.line,
                    background: ativo ? 'rgba(52,208,88,0.07)' : undefined,
                  }}
                >
                  <div style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15, marginBottom: 4 }}>
                    {m.titulo} {ativo && <span style={{ color: colors.grass }}>●</span>}
                  </div>
                  <p style={{ ...styles.mutedText, fontSize: 12, margin: 0 }}>{m.texto}</p>
                </button>
              )
            })}
          </div>

          {/* Os dois ficam MONTADOS e esconde-se o inativo: com um ternário,
              tocar no outro cartão desmontava o ativo e deitava fora um
              rachão já sorteado (ou as escolhas dos passos 2-3) sem aviso. */}
          <div hidden={modoSorteio !== 'completo'}>
            <MatchWizard
              pw={pw}
              jogadores={jogadores}
              matches={matches}
              conversao={conversao}
              convocatoria={convocatoria}
              onDadosAlterados={refresh}
            />
          </div>
          <div hidden={modoSorteio !== 'rapido'}>
            <QuickDraw
              pw={pw}
              jogadores={jogadores}
              onDadosAlterados={refresh}
              onOficializar={(equipas) => {
                // o rachão vira jogo oficial com as equipas que já tem: o
                // assistente salta a escolha de goleiros e de jogadores e
                // trata só das posições
                setConversao(equipas)
                setModoSorteio('completo')
              }}
            />
          </div>
        </div>
      )}

      {/* ---------- DESISTÊNCIAS (jogo já publicado) ---------- */}
      {tab === 'desistencias' && (
        <SubstitutionsPanel pw={pw} jogadores={jogadores} onDadosAlterados={refresh} />
      )}

      {/* ---------- POSIÇÕES DOS JOGADORES ---------- */}
      {tab === 'posicoes' && <PositionsAdmin pw={pw} />}

      {/* ---------- PLANTEL ---------- */}
      {tab === 'plantel' && (
        <PlantelPanel
          pw={pw}
          players={players}
          busy={busy}
          onAcao={acao}
          onRemover={(p) => rejeitar(p, 'Remover')}
        />
      )}

      {/* ---------- RODADAS ANTIGAS ---------- */}
      {tab === 'jogos' && (
        <RodadasPanel
          pw={pw}
          jogadores={jogadores}
          matches={matches}
          matchesErr={matchesErr}
          busy={busy}
          onErro={setError}
          onBusy={setBusy}
          onGuardado={refresh}
          onIrParaJogos={() => escolherAba('jogos-ciclo')}
        />
      )}

      {/* ---------- QUEM FALTA VOTAR ---------- */}
      {tab === 'faltas' && (
        <FaltasPanel pw={pw} />
      )}

      {/* ---------- ACESSOS / IDs ---------- */}
      {tab === 'utilizadores' && (
        <AcessosPanel
          pw={pw}
          users={users}
          usersErr={usersErr}
          busy={busy}
          onAcao={acao}
          onErro={setError}
          onBusy={setBusy}
        />
      )}
        </div>
      </div>
    </div>
  )
}
