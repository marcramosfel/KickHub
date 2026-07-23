import { useEffect, useState } from 'react'
import { getPlayerChemistry, getPlayerProfile } from '../api'
import { formatDia } from '../lib/format'
import Avatar from './Avatar'
import { descarregarCard, partilharCard, renderPlayerCard } from '../lib/card'
import {
  MIN_JOGOS,
  PARTICIPACOES_TOPO,
  PESO_DESEMPENHO,
  PESO_GRUPO,
  calcularOverall,
} from '../lib/overall'
import { balanco, calcularConquistas, calcularSequencias, resultadoDe } from '../lib/trophies'
import { ErrorBox, SectionTitle, SkeletonCard } from './Ui'
import { colors, fonts, styles } from '../theme'

const CORES_RES = { V: colors.grass, E: colors.muted, D: colors.error }

function StatBox({ label, valor, cor }) {
  return (
    <div
      style={{
        background: '#0C1915',
        border: `1px solid ${colors.line}`,
        borderRadius: 10,
        padding: '10px 8px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontFamily: fonts.title,
          fontSize: 24,
          fontWeight: 700,
          color: cor || colors.text,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {valor}
      </div>
      <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 0.5 }}>{label}</div>
    </div>
  )
}

// Uma parcela da conta do overall: descrição à esquerda, valor à direita.
function Parcela({ label, nota, valor, cor }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 10,
        padding: '6px 0',
        borderBottom: `1px solid ${colors.line}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13 }}>{label}</div>
        {nota && <div style={{ fontSize: 11, color: colors.muted }}>{nota}</div>}
      </div>
      <div
        style={{
          fontFamily: fonts.title,
          fontSize: 16,
          fontWeight: 700,
          color: cor || colors.text,
          fontVariantNumeric: 'tabular-nums',
          flexShrink: 0,
        }}
      >
        {valor}
      </div>
    </div>
  )
}

// "Como se calcula" — a decomposição do overall, aberta só a pedido.
function OverallExplicado({ o }) {
  if (o.overall == null) return null
  const num = (x) => (Math.round(x * 10) / 10).toFixed(1)
  const soPelaMedia = o.provisorio && o.base != null
  const soPeloCampo = o.base == null

  return (
    <>
      <details style={{ ...styles.panel, padding: 12, marginTop: 8 }}>
        <summary
          style={{
            cursor: 'pointer',
            fontSize: 13,
            color: colors.muted,
            listStyle: 'revert',
          }}
        >
          Como se calcula o overall?
        </summary>

        <div style={{ marginTop: 10 }}>
          {soPelaMedia ? (
            <>
              <Parcela
                label="Opinião do grupo"
                nota={`média ${(o.base / 20).toFixed(2)} × 20`}
                valor={num(o.base)}
                cor={colors.grass}
              />
              <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 10 }}>
                Com menos de {MIN_JOGOS} jogos, o desempenho em campo ainda é ruído — por isso
                conta só a nota do grupo. A partir daí entram os gols, as assistências e os
                prémios da rodada.
              </p>
            </>
          ) : soPeloCampo ? (
            <>
              <Parcela
                label="Desempenho em campo"
                nota={`${num(o.ppj)} participações por jogo`}
                valor={num(o.desempenho)}
                cor={colors.grass}
              />
              <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 10 }}>
                Ainda sem notas do grupo — por agora conta só o que aconteceu em campo.
              </p>
            </>
          ) : (
            <>
              <Parcela
                label={`Opinião do grupo (${Math.round(PESO_GRUPO * 100)}%)`}
                nota={`média ${(o.base / 20).toFixed(2)} × 20 = ${num(o.base)}`}
                valor={`+${num(PESO_GRUPO * o.base)}`}
                cor={colors.grass}
              />
              <Parcela
                label={`Desempenho em campo (${Math.round(PESO_DESEMPENHO * 100)}%)`}
                nota={`${num(o.ppj)} gols+assist. por jogo = ${num(o.desempenho)}`}
                valor={`+${num(PESO_DESEMPENHO * o.desempenho)}`}
                cor={colors.grass}
              />
              <Parcela
                label="👑 Bónus de craque"
                nota={o.bonusCraque > 0 ? 'máximo +9' : 'ainda sem craques'}
                valor={o.bonusCraque > 0 ? `+${o.bonusCraque}` : '0'}
                cor={o.bonusCraque > 0 ? colors.teamA : colors.muted}
              />
              <Parcela
                label="🐟 Desconto de bagre"
                nota={o.penalBagre > 0 ? 'máximo −6' : 'sem bagres 😌'}
                valor={o.penalBagre > 0 ? `−${o.penalBagre}` : '0'}
                cor={o.penalBagre > 0 ? colors.error : colors.muted}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  paddingTop: 10,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700 }}>Overall</span>
                <span
                  style={{
                    fontFamily: fonts.title,
                    fontSize: 22,
                    fontWeight: 700,
                    color: colors.grass,
                  }}
                >
                  {o.overall}
                </span>
              </div>
              <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 8 }}>
                {PARTICIPACOES_TOPO} gols+assistências por jogo valem 100 no desempenho. A média
                0–5 continua a ser a nota do grupo — o overall é só outra forma de a ler.
              </p>
            </>
          )}
        </div>
      </details>
    </>
  )
}

// Linha de "química": avatar, nome e a percentagem de vitórias.
function QuimicaRow({ x, cor }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
      <Avatar name={x.name} photo={x.photo} size={32} />
      <span style={{ flex: 1, fontSize: 14, minWidth: 0 }}>{x.name}</span>
      <span style={{ fontSize: 12, color: colors.muted, flexShrink: 0 }}>
        {x.vitorias}/{x.jogos}
      </span>
      <span
        style={{
          fontFamily: fonts.title,
          fontSize: 17,
          fontWeight: 700,
          color: cor,
          width: 52,
          textAlign: 'right',
          flexShrink: 0,
        }}
      >
        {x.pct}%
      </span>
    </div>
  )
}

export default function PlayerProfile({ playerId, totalRodadas = 0, onBack }) {
  const [p, setP] = useState(null)
  const [error, setError] = useState('')
  const [cardUrl, setCardUrl] = useState('')
  const [aviso, setAviso] = useState('')
  const [quimica, setQuimica] = useState(null) // null = indisponível (0013 por aplicar)

  useEffect(() => {
    let vivo = true
    getPlayerProfile(playerId)
      .then((d) => vivo && setP(d))
      .catch((err) => vivo && setError(err.message))
    // não-fatal: sem a 0013 a secção de curiosidades simplesmente não aparece
    getPlayerChemistry(playerId)
      .then((d) => vivo && setQuimica(d))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [playerId])

  // gera o card assim que o perfil chega
  useEffect(() => {
    if (!p) return
    let vivo = true
    renderPlayerCard(p)
      .then((url) => vivo && setCardUrl(url))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [p])

  const voltar = (
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
      ← Voltar
    </button>
  )

  if (error) {
    return (
      <div style={styles.page}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>{voltar}</div>
        <ErrorBox>{error}</ErrorBox>
      </div>
    )
  }

  if (!p) {
    return (
      <div style={styles.page}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>{voltar}</div>
        <SkeletonCard lines={4} />
      </div>
    )
  }

  const seq = calcularSequencias(p)
  const bal = balanco(p)
  const { desbloqueadas, bloqueadas } = calcularConquistas(p, totalRodadas)
  const ovr = calcularOverall(p)

  const partilhar = async () => {
    if (!cardUrl) return
    const r = await partilharCard(cardUrl, p.name)
    setAviso(r === 'partilhado' ? 'Partilhado ✓' : 'Card descarregado ✓')
    setTimeout(() => setAviso(''), 2200)
  }

  return (
    <div style={styles.page}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 14,
        }}
      >
        <h1 style={{ ...styles.title, fontSize: 20 }}>Perfil</h1>
        {voltar}
      </div>

      {/* card partilhável */}
      <div className="rise-in" style={{ ...styles.panel, padding: 14 }}>
        {cardUrl ? (
          <img
            src={cardUrl}
            alt={`Card de ${p.name}`}
            style={{ width: '100%', maxWidth: 340, margin: '0 auto', borderRadius: 14 }}
          />
        ) : (
          <div
            className="skeleton"
            style={{ width: '100%', maxWidth: 340, margin: '0 auto', aspectRatio: '600 / 840' }}
          />
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            onClick={partilhar}
            disabled={!cardUrl}
            style={{ ...styles.button, fontSize: 14, padding: '12px 10px' }}
          >
            📤 Partilhar card
          </button>
          <button
            onClick={() => cardUrl && descarregarCard(cardUrl, p.name)}
            disabled={!cardUrl}
            style={{ ...styles.buttonGhost, fontSize: 14, padding: '12px 10px' }}
          >
            ⬇️ Guardar
          </button>
        </div>
        {aviso && (
          <p style={{ color: colors.grass, fontSize: 13, marginTop: 8, textAlign: 'center' }}>
            {aviso}
          </p>
        )}
      </div>

      {/* números */}
      <SectionTitle>Números</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <StatBox label="MÉDIA" valor={p.avg == null ? '—' : Number(p.avg).toFixed(2)} cor={colors.grass} />
        <StatBox label="OVERALL" valor={ovr.overall == null ? '—' : ovr.overall} cor={colors.grass} />
        <StatBox label="JOGOS" valor={p.matches} />
        <StatBox label="GOLS" valor={p.goals} />
        <StatBox label="ASSIST." valor={p.assists} />
        <StatBox label="VOTOS" valor={p.votes} />
        <StatBox label="👑 CRAQUE" valor={p.craques} cor={colors.teamA} />
        <StatBox label="🐟 BAGRE" valor={p.bagres} cor={colors.teamB} />
        <StatBox
          label="V-E-D"
          valor={`${bal.V}-${bal.E}-${bal.D}`}
        />
      </div>

      {/* o overall tem de ser explicável, senão parece arbitrário */}
      <OverallExplicado o={ovr} />

      {/* sequências */}
      {(seq.marcando.melhor > 0 || seq.vitorias.melhor > 0) && (
        <>
          <SectionTitle cor={colors.teamA}>Sequências</SectionTitle>
          <div style={{ ...styles.panel, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {seq.marcando.atual >= 2 && (
              <p style={{ fontSize: 14 }}>
                🔥 <strong>{seq.marcando.atual} rodadas seguidas a marcar</strong> (a contar!)
              </p>
            )}
            {seq.marcando.melhor > 0 && (
              <p style={{ fontSize: 14, color: colors.muted }}>
                ⚽ Melhor sequência a marcar: <strong style={{ color: colors.text }}>{seq.marcando.melhor}</strong>
              </p>
            )}
            {seq.vitorias.atual >= 2 && (
              <p style={{ fontSize: 14 }}>
                🏆 <strong>{seq.vitorias.atual} vitórias seguidas</strong>
              </p>
            )}
            {seq.vitorias.melhor > 0 && (
              <p style={{ fontSize: 14, color: colors.muted }}>
                🥇 Melhor série de vitórias: <strong style={{ color: colors.text }}>{seq.vitorias.melhor}</strong>
              </p>
            )}
          </div>
        </>
      )}

      {/* conquistas */}
      <SectionTitle cor={colors.teamA}>Conquistas</SectionTitle>
      {desbloqueadas.length === 0 ? (
        <div style={{ ...styles.panel, textAlign: 'center', padding: 20 }}>
          <p style={styles.mutedText}>Ainda sem conquistas — joga e marca! ⚽</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {desbloqueadas.map((t) => (
            <div
              key={t.id}
              style={{
                ...styles.panel,
                padding: 10,
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                borderColor: colors.teamA,
              }}
            >
              <span style={{ fontSize: 24 }} aria-hidden>
                {t.icon}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{t.titulo}</div>
                <div style={{ fontSize: 11, color: colors.muted }}>{t.detalhe || t.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {bloqueadas.length > 0 && (
        <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 10 }}>
          Por desbloquear: {bloqueadas.map((t) => `${t.icon} ${t.titulo}`).join(' · ')}
        </p>
      )}

      {/* curiosidades / química */}
      {quimica &&
        (() => {
          const MIN = 2 // com menos de 2 jogos juntos não dá para concluir nada
          const parceiros = (quimica.parceiros || []).filter((x) => x.jogos >= MIN)
          const advers = (quimica.adversarios || []).filter((x) => x.jogos >= MIN)
          if (!parceiros.length && !advers.length) {
            return (
              <>
                <SectionTitle cor={colors.teamB}>Curiosidades</SectionTitle>
                <div style={{ ...styles.panel, textAlign: 'center', padding: 20 }}>
                  <p style={styles.mutedText}>
                    Ainda não há jogos suficientes para tirar conclusões — joga mais umas peladas! ⚽
                  </p>
                </div>
              </>
            )
          }
          const freguês = advers[0]
          const pesadelo = advers.length > 1 ? advers[advers.length - 1] : null
          return (
            <>
              <SectionTitle cor={colors.teamB}>Curiosidades</SectionTitle>
              <div style={{ ...styles.panel, padding: 12 }}>
                {parceiros.length > 0 && (
                  <>
                    <div style={{ fontSize: 13, color: colors.muted, marginBottom: 4 }}>
                      🤝 Com quem ganha mais (mesmo time)
                    </div>
                    {parceiros.slice(0, 3).map((x) => (
                      <QuimicaRow key={x.player_id} x={x} cor={colors.grass} />
                    ))}
                  </>
                )}

                {freguês && (
                  <div style={{ marginTop: parceiros.length ? 14 : 0 }}>
                    <div style={{ fontSize: 13, color: colors.muted, marginBottom: 4 }}>
                      😎 Freguês (ganha mais vezes contra)
                    </div>
                    <QuimicaRow x={freguês} cor={colors.grass} />
                  </div>
                )}

                {pesadelo && pesadelo.player_id !== freguês?.player_id && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 13, color: colors.muted, marginBottom: 4 }}>
                      👻 Pesadelo (contra quem ganha menos)
                    </div>
                    <QuimicaRow x={pesadelo} cor={colors.error} />
                  </div>
                )}

                <p style={{ ...styles.mutedText, fontSize: 11, marginTop: 12 }}>
                  Só conta pares com {MIN}+ jogos juntos. A percentagem é de vitórias.
                </p>
              </div>
            </>
          )
        })()}

      {/* histórico */}
      <SectionTitle>Histórico</SectionTitle>
      {(p.history || []).length === 0 ? (
        <div style={{ ...styles.panel, textAlign: 'center', padding: 20 }}>
          <p style={styles.mutedText}>Ainda não jogou nenhuma rodada registada.</p>
        </div>
      ) : (
        <div style={{ ...styles.panel, padding: 8 }}>
          {p.history.map((h, i) => {
            const res = resultadoDe(h)
            return (
              <div
                key={h.match_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 6px',
                  borderBottom: i < p.history.length - 1 ? `1px solid ${colors.line}` : 'none',
                }}
              >
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    color: res ? CORES_RES[res] : colors.muted,
                    border: `1px solid ${res ? CORES_RES[res] : colors.line}`,
                  }}
                >
                  {res || '–'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13 }}>{formatDia(h.played_at)}</div>
                  <div style={{ fontSize: 11, color: colors.muted }}>
                    {h.team_a_name} {h.score_a}–{h.score_b} {h.team_b_name}
                  </div>
                </div>
                <span style={{ fontSize: 12, color: colors.muted, flexShrink: 0 }}>
                  {h.goals > 0 && <span style={{ color: colors.text }}>⚽{h.goals} </span>}
                  {h.assists > 0 && <span style={{ color: colors.text }}>🅰️{h.assists} </span>}
                  {h.craque && '👑'}
                  {h.bagre && '🐟'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
