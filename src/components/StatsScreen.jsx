import { useEffect, useRef, useState } from 'react'
import { getFeed, getMatches, getMyOpenVotes, getPlayerStats, getPlayerStatsRange } from '../api'
import {
  assisters as getAssisters,
  awardWinners,
  formatDia,
  intervaloDe,
  matchWinner,
  ownScorers as getOwnScorers,
  PERIODOS,
  scorers as getScorers,
} from '../lib/format'
import {
  faltaVotarTexto,
  pendenciasReais,
  resultadoBloqueado,
  tempoAteFechar,
} from '../lib/voting'
import { liderancas } from '../lib/trophies'
import { NomeClicavel } from './RoundParts'
import Avatar from './Avatar'
import Feed from './Feed'
import RoundDetail from './RoundDetail'
import { ErrorBox, SkeletonCard } from './Ui'
import { colors, fonts, styles } from '../theme'

const MEDALS = ['🥇', '🥈', '🥉']

// Atalho para a cédula de votação.
//
// A votação vivia AQUI, em dois cartões (craque/bagre e estrelas) enterrados
// dentro de Estatísticas → Rodadas. Chegar-lhes custava seis navegações e
// dois envios, e era essa a razão de quase ninguém votar. Agora vive num ecrã
// próprio, com link partilhável; daqui fica só o convite.
function ChamadaParaVotar({ pendencia, onVotar }) {
  const t = tempoAteFechar(pendencia.deadline)
  const falta = faltaVotarTexto(pendencia)
  return (
    <div style={{ ...styles.panel, border: `1px solid ${colors.teamA}`, marginBottom: 12 }}>
      <div style={{ ...styles.title, fontSize: 16, marginBottom: 4 }}>
        🗳️ Falta o teu voto — {formatDia(pendencia.played_at)}
      </div>
      <p style={{ ...styles.mutedText, fontSize: 13 }}>
        {falta ? `Por dar: ${falta}.` : 'Tens votos por dar nesta rodada.'}
        {t.conhecido && !t.expirado ? ` Fecha em ${t.texto}.` : ''}
      </p>
      <button
        type="button"
        onClick={() => onVotar?.(pendencia.match_id)}
        style={{ ...styles.button, marginTop: 12 }}
      >
        Votar agora
      </button>
    </div>
  )
}

// Card de uma rodada no histórico: placar, vencedor, marcadores/assistentes,
// craque/bagre e "Ver detalhes" (que abre a rodada com fotos).
function MatchPanel({ match, onDetail, onProfile, bloqueado, onVotar }) {
  const scorers = getScorers(match)
  const assisters = getAssisters(match)
  const ownGoals = getOwnScorers(match)
  const craque = awardWinners(match.craque)
  const bagre = awardWinners(match.bagre)
  const w = matchWinner(match)
  const temPlacar = Number(match.score_a || 0) + Number(match.score_b || 0) > 0 || match.team_a_name

  return (
    <div style={{ ...styles.panel, padding: 14, marginBottom: 10 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 8,
          gap: 8,
        }}
      >
        <span style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15 }}>
          {formatDia(match.played_at)}
        </span>
        <span style={{ fontSize: 12, color: colors.muted, flexShrink: 0 }}>
          {match.votes}/{match.players.length} votaram
        </span>
      </div>

      {/* placar compacto */}
      {temPlacar && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 10,
            padding: '8px 12px',
            borderRadius: 10,
            background: '#0C1915',
            border: `1px solid ${colors.line}`,
          }}
        >
          <span
            style={{
              fontFamily: fonts.title,
              fontSize: 20,
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              flexShrink: 0,
            }}
          >
            <span style={{ color: colors.teamA }}>{Number(match.score_a || 0)}</span>
            <span style={{ color: colors.muted }}> — </span>
            <span style={{ color: colors.teamB }}>{Number(match.score_b || 0)}</span>
          </span>
          <span style={{ fontSize: 13, color: w.isDraw ? colors.muted : colors.grass, fontWeight: 600 }}>
            {w.isDraw ? '🤝 Empate' : `🏆 ${w.name}`}
          </span>
        </div>
      )}

      <p style={{ fontSize: 13, marginBottom: 4 }}>
        ⚽{' '}
        {scorers.length ? (
          scorers.map((p, i) => (
            <span key={p.player_id}>
              {i > 0 && ', '}
              <NomeClicavel id={p.player_id} nome={p.name} onProfile={onProfile} />
              {p.goals > 1 && <span style={{ color: colors.muted }}> ({p.goals})</span>}
            </span>
          ))
        ) : (
          <span style={{ color: colors.muted }}>sem gols</span>
        )}
      </p>
      <p style={{ fontSize: 13, marginBottom: 8 }}>
        🅰️{' '}
        {assisters.length ? (
          assisters.map((p, i) => (
            <span key={p.player_id}>
              {i > 0 && ', '}
              <NomeClicavel id={p.player_id} nome={p.name} onProfile={onProfile} />
              {p.assists > 1 && <span style={{ color: colors.muted }}> ({p.assists})</span>}
            </span>
          ))
        ) : (
          <span style={{ color: colors.muted }}>sem assistências</span>
        )}
      </p>
      {/* autogolos: só quando existem — nunca somam aos ⚽ de ninguém */}
      {ownGoals.length > 0 && (
        <p style={{ fontSize: 13, marginBottom: 8 }}>
          🥅{' '}
          <span style={{ color: colors.muted }}>AG: </span>
          {ownGoals.map((p, i) => (
            <span key={p.player_id}>
              {i > 0 && ', '}
              <NomeClicavel id={p.player_id} nome={p.name} onProfile={onProfile} />
              {p.own_goals > 1 && <span style={{ color: colors.muted }}> ({p.own_goals})</span>}
            </span>
          ))}
        </p>
      )}

      {/* o craque e o bagre ficam tapados a quem ainda tem voto por dar
          nesta rodada — ver `resultadoBloqueado` */}
      {bloqueado ? (
        <button
          type="button"
          onClick={onVotar}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '10px 12px',
            borderRadius: 10,
            border: `1px dashed ${colors.teamA}`,
            background: 'rgba(255,197,49,0.06)',
            color: colors.text,
            font: 'inherit',
            fontSize: 13,
            textAlign: 'left',
          }}
        >
          <span aria-hidden style={{ fontSize: 16 }}>🔒</span>
          <span style={{ flex: 1 }}>
            <strong>Vota para ver</strong> o craque e o bagre desta rodada.
          </span>
          <span style={{ color: colors.teamA, fontWeight: 700, flexShrink: 0 }}>Votar →</span>
        </button>
      ) : match.votes > 0 ? (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
          {craque && (
            <span style={{ color: colors.teamA }}>
              👑 {craque.names} <span style={{ color: colors.muted }}>({craque.votes}{' '}
              {craque.votes === 1 ? 'voto' : 'votos'})</span>
            </span>
          )}
          {bagre && (
            <span style={{ color: colors.teamB }}>
              🐟 {bagre.names} <span style={{ color: colors.muted }}>({bagre.votes}{' '}
              {bagre.votes === 1 ? 'voto' : 'votos'})</span>
            </span>
          )}
        </div>
      ) : (
        <p style={{ ...styles.mutedText, fontSize: 13 }}>Ainda sem votos de craque/bagre.</p>
      )}

      <button
        onClick={() => onDetail(match.id)}
        style={{ ...styles.buttonGhost, marginTop: 12, padding: '10px 16px', fontSize: 14 }}
      >
        Ver detalhes →
      </button>
    </div>
  )
}

export default function StatsScreen({
  session,
  onBack,
  initialTab = 'geral',
  // deep-link do feed: abre logo esta rodada em detalhe
  initialMatchId = null,
  onProfile,
  // leva à cédula de votação, que já não vive dentro deste ecrã
  onVotar,
  embutido = false,
  // muda a cada toque na navegação, mesmo para o mesmo destino
  navToken = 0,
}) {
  // Dentro da casca de navegação o contentor já vem de fora: um segundo
  // styles.page daria margens a dobrar e limitaria a largura a 480px.
  const pageStyle = embutido ? undefined : styles.page
  const [tab, setTab] = useState(initialTab) // geral | rodadas

  // Estatísticas e Histórico são a mesma página em separadores diferentes.
  // Sem isto, clicar em "Histórico" já dentro de "Estatísticas" não fazia
  // nada — o componente não desmonta, e o initialTab só valia no primeiro
  // render. Ajustar durante o render evita remontar (e recarregar) tudo.
  //
  // O `navToken` entra na comparação para cobrir o caso em que o separador foi
  // mudado à mão: aí o `initialTab` não muda, mas o toque na navegação tem de
  // voltar a mandar.
  const [navPedido, setNavPedido] = useState({ tab: initialTab, token: navToken })
  const [stats, setStats] = useState(null)
  const [matches, setMatches] = useState(null)
  // O feed vem com fotos em base64 nos posts de resultado — pesado em dados
  // móveis. Por isso só se carrega quando se abre mesmo o separador.
  const [feed, setFeed] = useState(null)
  // rodadas com votação aberta em que joguei e ainda tenho algo por dar
  const [pendencias, setPendencias] = useState([])
  const [detailId, setDetailId] = useState(initialMatchId) // rodada aberta em detalhe
  if (navPedido.tab !== initialTab || navPedido.token !== navToken) {
    setNavPedido({ tab: initialTab, token: navToken })
    setTab(initialTab)
    // o deep-link do feed abre a rodada certa; uma navegação normal fecha o
    // detalhe que tenha ficado aberto da visita anterior
    setDetailId(initialMatchId)
  }
  const [periodo, setPeriodo] = useState('sempre')
  const [error, setError] = useState('')

  // totais do período escolhido (cai para o get_player_stats se a 0013
  // ainda não estiver aplicada).
  //
  // `pedido` descarta respostas fora de ordem: trocar de período depressa
  // deixava a tabela com os números de um período e o chip aceso noutro,
  // conforme a ordem por que as respostas chegassem.
  const pedido = useRef(0)
  const carregarStats = (p) => {
    const meu = ++pedido.current
    const { de, ate } = intervaloDe(p)
    return getPlayerStatsRange(de, ate)
      .catch(() => getPlayerStats())
      .then((s) => {
        if (meu !== pedido.current) return
        setStats(s || [])
        setError('')
      })
  }

  const load = () =>
    Promise.all([
      carregarStats(periodo),
      getMatches(),
      // O token entra aqui porque uma sessão vinda do "lembrar-me" não tem
      // PIN: sem ele a chamada devolvia CRED e o atalho para votar
      // desaparecia justamente a quem entrou pelo link.
      // Não-fatal na mesma: sem a 0025 aplicada o atalho não aparece, em vez
      // de deitar abaixo o histórico todo.
      getMyOpenVotes(session.id, session.pin, session.token).catch(() => []),
    ])
      .then(([, m, p]) => {
        setMatches(m || [])
        setPendencias(p || [])
        setError('')
      })
      .catch((err) => setError(err.message))

  // O primeiro carregamento traz tudo; a partir daí, mudar de período só
  // recarrega os totais. `jaCarregou` distingue os dois casos sem precisar de
  // ler o `stats` (que é exatamente o que este efeito escreve).
  const jaCarregou = useRef(false)
  useEffect(() => {
    if (!jaCarregou.current) {
      jaCarregou.current = true
      load()
      return
    }
    // sem isto, falhar a mudança de período não dizia nada: o chip acendia e a
    // tabela ficava com os números do período anterior
    carregarStats(periodo).catch((err) => setError(err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo])

  // O feed só quando o separador é aberto — e uma vez só.
  useEffect(() => {
    if (tab !== 'feed' || feed !== null) return
    getFeed(20)
      .then((l) => setFeed(l || []))
      .catch(() => setFeed([])) // sem a migração do feed, a lista fica vazia
  }, [tab, feed])

  // detalhe de uma rodada (com fotos) sobrepõe-se ao resto
  if (detailId) {
    return (
      <RoundDetail
        matchId={detailId}
        onBack={() => setDetailId(null)}
        onProfile={(id) => onProfile?.(id, matches?.length || 0)}
        bloqueado={resultadoBloqueado(detailId, pendencias)}
        onVotar={() => onVotar?.(detailId)}
      />
    )
  }

  const tabBtn = (id, label) => (
    <button
      onClick={() => setTab(id)}
      style={{
        flex: 1,
        padding: '10px 0',
        background: 'transparent',
        color: tab === id ? colors.text : colors.muted,
        border: 'none',
        borderBottom: `2px solid ${tab === id ? colors.grass : colors.line}`,
        fontFamily: fonts.title,
        textTransform: 'uppercase',
        letterSpacing: 1,
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  )

  if (stats === null || matches === null) {
    return (
      <div style={pageStyle}>
        <h1 style={{ ...styles.title, fontSize: 22, marginBottom: 16 }}>Estatísticas 📊</h1>
        {error ? (
          <>
            <ErrorBox>{error}</ErrorBox>
            <button style={{ ...styles.buttonGhost, marginTop: 16 }} onClick={onBack}>
              Voltar
            </button>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SkeletonCard lines={4} />
            <SkeletonCard lines={3} />
          </div>
        )}
      </div>
    )
  }

  // Rodadas em que joguei e ainda tenho voto por dar. Quem decide é o
  // servidor (`get_my_open_votes`), que já olha para o prazo e para as duas
  // votações ao mesmo tempo — a lista antiga só sabia do craque/bagre.
  const porVotar = pendenciasReais(pendencias)

  // Enquanto ninguém marcar na própria baliza, a coluna AG não aparece.
  const temAutogolos = stats.some((p) => (p.own_goals || 0) > 0)

  return (
    <div style={pageStyle}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 14,
        }}
      >
        <h1 style={{ ...styles.title, fontSize: 22 }}>
          {tab === 'rodadas' ? 'Histórico' : 'Estatísticas'}{' '}
          <span style={{ color: colors.grass }}>{tab === 'rodadas' ? '📜' : '📊'}</span>
        </h1>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: colors.muted,
            fontSize: 13,
            textDecoration: 'underline',
          }}
        >
          Voltar
        </button>
      </div>

      <div style={{ display: 'flex', marginBottom: 16 }}>
        {tabBtn('geral', 'Geral')}
        {tabBtn('rodadas', `Rodadas${porVotar.length ? ' 🗳️' : ''}`)}
        {/* O feed saiu da Home (que passou a mostrar só o estado atual da
            pelada) e veio para aqui, ao lado das rodadas a que se refere. */}
        {tabBtn('feed', 'Últimas')}
      </div>

      {error && <p style={{ ...styles.errorText, marginBottom: 12 }}>{error}</p>}

      {/* ---------- GERAL ---------- */}
      {tab === 'geral' && (
        <div>
          {/* período / temporada */}
          <div
            style={{
              display: 'flex',
              gap: 6,
              marginBottom: 12,
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {PERIODOS.map((p) => {
              const on = periodo === p.id
              return (
                <button
                  key={p.id}
                  onClick={() => setPeriodo(p.id)}
                  style={{
                    flexShrink: 0,
                    padding: '7px 14px',
                    borderRadius: 999,
                    border: `1px solid ${on ? colors.grass : colors.line}`,
                    background: on ? 'rgba(52,208,88,0.14)' : '#0C1915',
                    color: on ? colors.grass : colors.muted,
                    fontSize: 13,
                    fontWeight: on ? 700 : 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.label}
                </button>
              )
            })}
          </div>

          {stats.length === 0 ? (
            <div style={{ ...styles.panel, textAlign: 'center', padding: 22 }}>
              <p style={styles.mutedText}>Ainda não há jogadores aprovados.</p>
            </div>
          ) : (
            <div style={{ ...styles.panel, padding: 8 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '4px 8px 8px',
                  fontSize: 12,
                  color: colors.muted,
                  borderBottom: `1px solid ${colors.line}`,
                }}
              >
                <span style={{ width: 22 }} />
                <span style={{ width: 36 }} />
                <span style={{ flex: 1 }}>Jogador</span>
                <span style={statCol}>J</span>
                <span style={statCol}>⚽</span>
                <span style={statCol}>🅰️</span>
                {/* a coluna dos autogolos só existe quando alguém tem algum:
                    num plantel inteiro a zeros era uma coluna de zeros */}
                {temAutogolos && <span style={statCol}>AG</span>}
                <span style={statCol}>👑</span>
                <span style={statCol}>🐟</span>
              </div>
              {stats.map((p, i) => (
                <div
                  key={p.id}
                  onClick={() => onProfile?.(p.id, matches.length)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    // role="button" tem de responder ao espaço, não só ao Enter
                    if (e.key !== 'Enter' && e.key !== ' ') return
                    e.preventDefault()
                    onProfile?.(p.id, matches.length)
                  }}
                  title={`Ver perfil de ${p.name}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 8px',
                    borderBottom: i < stats.length - 1 ? `1px solid ${colors.line}` : 'none',
                    background:
                      p.id === session.id ? 'rgba(52,208,88,0.06)' : 'transparent',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  <span
                    style={{
                      fontFamily: fonts.title,
                      color: colors.muted,
                      width: 22,
                      textAlign: 'center',
                      fontSize: i < 3 && p.goals > 0 ? 17 : 14,
                    }}
                  >
                    {i < 3 && p.goals > 0 ? MEDALS[i] : i + 1}
                  </span>
                  <Avatar name={p.name} photo={p.photo} size={36} />
                  <span
                    style={{
                      flex: 1,
                      fontSize: 14,
                      fontWeight: p.id === session.id ? 700 : 400,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {p.name}
                  </span>
                  <span style={{ ...statCol, color: colors.muted }}>{p.matches}</span>
                  <span style={{ ...statCol, fontWeight: 700 }}>{p.goals}</span>
                  <span style={statCol}>{p.assists}</span>
                  {temAutogolos && (
                    <span style={{ ...statCol, color: colors.muted }}>{p.own_goals || 0}</span>
                  )}
                  <span style={{ ...statCol, color: colors.teamA }}>{p.craques}</span>
                  <span style={{ ...statCol, color: colors.teamB }}>{p.bagres}</span>
                </div>
              ))}
            </div>
          )}
          <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 10 }}>
            J = jogos · ⚽ gols · 🅰️ assistências
            {temAutogolos ? ' · AG autogolos (não contam como gols)' : ''} · 👑 craque da rodada ·
            🐟 bagre da rodada
          </p>

          {/* quadro de troféus do grupo */}
          {(() => {
            const l = liderancas(stats)
            const linhas = [
              ['⚽', 'Artilheiro', l.artilheiro, 'gols'],
              ['🅰️', 'Rei das assistências', l.garcom, 'assist.'],
              ['👑', 'Mais craques', l.craque, '×'],
              ['🐟', 'Mais bagres', l.bagre, '×'],
            ].filter(([, , v]) => v)
            if (!linhas.length) return null
            return (
              <>
                <div
                  style={{
                    fontFamily: fonts.title,
                    letterSpacing: 1,
                    fontSize: 15,
                    margin: '22px 0 8px',
                  }}
                >
                  🏆 Troféus do grupo
                </div>
                <div style={{ ...styles.panel, padding: 10 }}>
                  {linhas.map(([icon, titulo, dados, unidade], i) => (
                    <div
                      key={titulo}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 4px',
                        borderBottom: i < linhas.length - 1 ? `1px solid ${colors.line}` : 'none',
                      }}
                    >
                      <span style={{ fontSize: 20 }} aria-hidden>
                        {icon}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: colors.muted }}>{titulo}</div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>
                          {dados.jogadores.map((j) => j.name).join(' e ')}
                        </div>
                      </div>
                      <span
                        style={{
                          fontFamily: fonts.title,
                          fontSize: 18,
                          fontWeight: 700,
                          color: colors.grass,
                          flexShrink: 0,
                        }}
                      >
                        {dados.valor}
                        <span style={{ fontSize: 11, color: colors.muted }}> {unidade}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* ---------- RODADAS ---------- */}
      {tab === 'rodadas' && (
        <div>
          {/* A votação já não vive aqui: era este o problema. Estar enterrada
              em Estatísticas → Rodadas custava seis navegações e dois envios,
              e quase ninguém chegava ao fim. Agora é um ecrã próprio, com
              link partilhável — daqui fica só o atalho. */}
          {porVotar.map((p) => (
            <ChamadaParaVotar key={p.match_id} pendencia={p} onVotar={onVotar} />
          ))}
          {matches.length === 0 && (
            <div style={{ ...styles.panel, textAlign: 'center', padding: 22 }}>
              <p style={styles.mutedText}>
                Ainda não há rodadas registadas. Depois de cada pelada, o admin regista os gols
                e as assistências — e a votação abre aqui.
              </p>
            </div>
          )}
          {matches.map((m) => (
            <MatchPanel
              key={m.id}
              match={m}
              onDetail={setDetailId}
              onProfile={(id) => onProfile?.(id, matches.length)}
              bloqueado={resultadoBloqueado(m.id, pendencias)}
              onVotar={() => onVotar?.(m.id)}
            />
          ))}
        </div>
      )}

      {/* ---------- ÚLTIMAS (o feed) ---------- */}
      {tab === 'feed' && (
        <div>
          {feed === null ? (
            <SkeletonCard lines={4} />
          ) : feed.length === 0 ? (
            <div style={{ ...styles.panel, textAlign: 'center', padding: 22 }}>
              <p style={styles.mutedText}>
                Ainda não há publicações. Elas nascem quando o admin publica um sorteio ou um
                resultado.
              </p>
            </div>
          ) : (
            <Feed
              posts={feed}
              // `stats` traz id, nome e foto — é o que o destaque do craque
              // e do bagre precisa. Não há aqui a lista enriquecida da Home.
              jogadores={stats}
              porVotar={porVotar}
              onProfile={onProfile}
              onVotar={onVotar}
              onNavigate={(destino, extra) => {
                // "Abrir jogo" do feed aponta para UMA rodada — e já estamos
                // no ecrã que a sabe mostrar.
                if (extra?.matchId) setDetailId(extra.matchId)
                else if (destino === 'history') setTab('rodadas')
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

const statCol = {
  width: 26,
  textAlign: 'center',
  fontSize: 13,
  flexShrink: 0,
}
