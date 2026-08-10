import { useMemo, useState } from 'react'
import {
  CAMPO_DA_ABA,
  ordenarGoleiros,
  ordenarJogadoresDeCampo,
  ordenarPor,
  RANKING_TABS,
} from '../lib/ranking'
import { PLAYER_TYPE } from '../lib/positions'
import { ICONE } from '../lib/icones'
import { RODADAS_PROVISORIO } from '../lib/overall'
import PlayerCard from './PlayerCard'
import { SectionTitle } from './Ui'
import { colors, fonts, styles } from '../theme'

// Ranking, por abas.
//
// A lista principal é ordenada pelo overall — não pela média nem pelos gols —
// porque é o overall que manda no sorteio. Goleiros têm ranking próprio: um
// goleiro não se compara com um atacante por gols e assistências.

// Unidade que acompanha o número de cada aba de totais.
const UNIDADE_DA_ABA = {
  artilheiros: 'gols',
  assistencias: 'assist.',
  craques: '×',
  vitorias: 'vitórias',
}

// Os rankings são listas: dizê-lo em HTML dá a quem usa leitor de ecrã a
// contagem ("1 de 24") que um `div` atrás de outro não dá.
const LISTA = { gap: 8, listStyle: 'none' }

function ExplicacaoGoleiro() {
  return (
    <details className="pb-card" style={{ marginTop: 14, padding: 14 }}>
      <summary
        style={{
          cursor: 'pointer',
          fontFamily: fonts.title,
          letterSpacing: 1,
          fontSize: 14,
          listStyle: 'revert',
        }}
      >
        Como é calculado o overall do goleiro?
      </summary>
      <div style={{ fontSize: 13, lineHeight: 1.6, color: colors.text, marginTop: 10 }}>
        <p style={{ marginBottom: 8 }}>
          Um goleiro não é avaliado por gols nem assistências. O número junta quatro coisas:
        </p>
        <ul style={{ paddingLeft: 18, marginBottom: 10, color: colors.muted }}>
          <li>
            <strong style={{ color: colors.text }}>60% — percentagem de defesas.</strong> Das
            finalizações que enfrentou (defesas + gols sofridos), quantas agarrou.
          </li>
          <li>
            <strong style={{ color: colors.text }}>20% — gols sofridos</strong>, comparados com a
            média de todos os goleiros da pelada. Sofrer 2 por jogo pode ser bom ou mau — depende
            de como está o resto.
          </li>
          <li>
            <strong style={{ color: colors.text }}>10% — jogos sem sofrer gol.</strong>
          </li>
          <li>
            <strong style={{ color: colors.text }}>10% — vitórias.</strong>
          </li>
        </ul>
        <p style={{ marginBottom: 8 }}>
          Exemplo: 10 defesas e 5 gols sofridos são 15 finalizações enfrentadas — 66,7% de defesas.
          As 10 defesas contam a favor, mesmo tendo sofrido 5.
        </p>
        <p style={{ color: colors.muted }}>
          Para ninguém ficar em primeiro com um jogo só, o valor aproxima-se de 50 enquanto houver
          poucas rodadas e só vale por inteiro a partir de 5 jogos. Abaixo de {RODADAS_PROVISORIO}{' '}
          jogos aparece como <em>Provisório</em>.
        </p>
      </div>
    </details>
  )
}

function Vazio({ children }) {
  return (
    <div style={{ ...styles.panel, textAlign: 'center', padding: 26 }}>
      <p style={styles.mutedText}>{children}</p>
    </div>
  )
}

// Alinha a linha de números com o nome do goleiro (medalha + avatar acima).
const RECUO_DA_LINHA = '6px 12px 10px 54px'

// Uma linha do ranking de goleiros: além do overall, os números que o explicam.
//
// `saves`/`goalsConceded`/`cleanSheets` só existem se houver linha na tabela de
// baliza; sem a migração 0017 aplicada vêm todos a null. Escrevê-los com um
// `?? 0` dizia "0 defesas, 0 gols sofridos" de um goleiro que jogou a época
// toda — números inventados são piores do que a falta deles.
function LinhaGoleiro({ g, i, liderancas, onProfile }) {
  const temNumeros = g.saves != null || g.goalsConceded != null || g.cleanSheets != null

  return (
    <div className="pb-stack" style={{ gap: 0 }}>
      <PlayerCard
        jogador={g}
        liderancas={liderancas}
        rank={i + 1}
        variante="linha"
        mostrarPosicao
        onClick={onProfile ? () => onProfile(g.id) : undefined}
        rotulo={g.provisorio ? 'Provisório' : undefined}
      />
      {temNumeros ? (
        <div
          className="pb-scroll-x"
          style={{
            display: 'flex',
            gap: 14,
            padding: RECUO_DA_LINHA,
            fontSize: 12,
            color: colors.muted,
          }}
        >
          <span>🧤 {g.saves ?? '—'} defesas</span>
          <span>
            🎯 {g.savePct != null ? `${Math.round(g.savePct)}%` : '—'} de defesas
          </span>
          <span>
            {ICONE.golsSofridos} {g.goalsConceded ?? '—'} sofridos
          </span>
          <span>
            📉{' '}
            {g.goalsConcededPerMatch != null ? g.goalsConcededPerMatch.toFixed(2) : '—'} por jogo
          </span>
          <span>🧱 {g.cleanSheets ?? '—'} sem sofrer</span>
          <span>🎮 {g.matches ?? 0} jogos</span>
        </div>
      ) : (
        <p style={{ ...styles.mutedText, fontSize: 12, padding: RECUO_DA_LINHA }}>
          Ainda sem defesas e gols sofridos registados.
        </p>
      )}
    </div>
  )
}

export default function RankingScreen({ jogadores, liderancas, onProfile, initialTab = 'campo' }) {
  const [tab, setTab] = useState(initialTab)

  const campo = useMemo(
    () => ordenarJogadoresDeCampo(jogadores.filter((j) => j.playerType !== PLAYER_TYPE.GOALKEEPER)),
    [jogadores]
  )
  const goleiros = useMemo(
    () =>
      ordenarGoleiros(
        jogadores.filter((j) => j.playerType === PLAYER_TYPE.GOALKEEPER || j.gkOverall != null)
      ),
    [jogadores]
  )
  const porCampo = useMemo(() => {
    const c = CAMPO_DA_ABA[tab]
    return c ? ordenarPor(jogadores, c) : []
  }, [jogadores, tab])

  const temVitorias = jogadores.some((j) => j.wins != null)

  return (
    <div>
      <h1 style={{ ...styles.title, fontSize: 22, marginBottom: 4 }}>
        Ranking <span style={{ color: colors.grass }}>🏅</span>
      </h1>
      <p style={{ ...styles.mutedText, fontSize: 13, marginBottom: 14 }}>
        A lista principal é ordenada pelo <strong style={{ color: colors.teamA }}>overall</strong> —
        o mesmo número que o sorteio usa para equilibrar as equipas.
      </p>

      <div
        className="pb-scroll-x"
        style={{ display: 'flex', gap: 6, marginBottom: 16 }}
        role="tablist"
        aria-label="Categorias do ranking"
      >
        {RANKING_TABS.map((t) => {
          const on = tab === t.id
          return (
            <button
              key={t.id}
              id={`ranking-aba-${t.id}`}
              role="tab"
              type="button"
              aria-selected={on}
              aria-controls="ranking-painel"
              onClick={() => setTab(t.id)}
              style={{
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 14px',
                minHeight: 42,
                borderRadius: 999,
                border: `1px solid ${on ? colors.grass : colors.line}`,
                background: on ? 'rgba(52,208,88,0.14)' : '#0C1915',
                color: on ? colors.grass : colors.muted,
                fontSize: 13,
                fontWeight: on ? 700 : 500,
                whiteSpace: 'nowrap',
              }}
            >
              <span aria-hidden>{t.icon}</span>
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Um `role="tab"` sem painel associado deixa quem usa leitor de ecrã sem
          saber para onde a aba leva — daí o id fixo e o `aria-controls` acima. */}
      <div id="ranking-painel" role="tabpanel" aria-labelledby={`ranking-aba-${tab}`}>
        {/* ---------- jogadores de campo ---------- */}
        {tab === 'campo' &&
          (campo.length === 0 ? (
            <Vazio>
              Ainda não existem estatísticas suficientes para calcular este ranking.
            </Vazio>
          ) : (
            <ul className="pb-stack" style={LISTA}>
              {campo.map((j, i) => (
                <li key={j.id}>
                  <PlayerCard
                    jogador={j}
                    liderancas={liderancas}
                    rank={i + 1}
                    variante="linha"
                    mostrarPosicao
                    onClick={onProfile ? () => onProfile(j.id) : undefined}
                  />
                </li>
              ))}
            </ul>
          ))}

        {/* ---------- goleiros ---------- */}
        {tab === 'goleiros' && (
          <>
            {goleiros.length === 0 ? (
              <Vazio>
                Ainda não há goleiros com jogos registados. Assim que o admin registar defesas e
                gols sofridos numa rodada, o ranking aparece aqui.
              </Vazio>
            ) : (
              <ul className="pb-stack" style={LISTA}>
                {goleiros.map((g, i) => (
                  <li key={g.id}>
                    <LinhaGoleiro g={g} i={i} liderancas={liderancas} onProfile={onProfile} />
                  </li>
                ))}
              </ul>
            )}
            <ExplicacaoGoleiro />
          </>
        )}

        {/* ---------- artilheiros / assistências / craques / vitórias ---------- */}
        {CAMPO_DA_ABA[tab] && (
          <>
            {tab === 'vitorias' && !temVitorias ? (
              <Vazio>
                Ainda não há rodadas com times atribuídos — sem isso não dá para saber quem ganhou.
              </Vazio>
            ) : porCampo.length === 0 ? (
              <Vazio>Ainda não existem estatísticas suficientes para calcular este ranking.</Vazio>
            ) : (
              <ul className="pb-stack" style={LISTA}>
                {porCampo.map((j, i) => (
                  <li key={j.id}>
                    <PlayerCard
                      jogador={j}
                      liderancas={liderancas}
                      rank={i + 1}
                      variante="linha"
                      mostrarOverall={false}
                      rotulo={`${j[CAMPO_DA_ABA[tab]]} ${UNIDADE_DA_ABA[tab] || ''}`.trim()}
                      onClick={onProfile ? () => onProfile(j.id) : undefined}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {tab === 'campo' && campo.length > 0 && (
          <>
            <SectionTitle>Como se ordena</SectionTitle>
            <div className="pb-card" style={{ fontSize: 13, color: colors.muted, lineHeight: 1.6 }}>
              1.º overall · 2.º mais jogos · 3.º mais participações em gol (gols + assistências) ·
              4.º mais vitórias.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
