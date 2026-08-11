import { useMemo } from 'react'
import { estadoDoJogo, formatarDataDoJogo } from '../lib/countdown'
import { avaliarEquilibrio } from '../lib/drawEngine'
import { nomeDaPosicao } from '../lib/positions'
import { vantagem } from '../lib/substitutions'
import { renderSorteioImagem } from '../lib/jogoImagem'
import BotaoPartilhar from './BotaoPartilhar'
import Countdown from './Countdown'
import FootballPitch from './FootballPitch'
import PrevisaoDaPelada from './PrevisaoDaPelada'
import RodizioTimeline from './RodizioTimeline'
import AvisoDeDesistencias, { VantagemAtual } from './Substitutions'
import { colors, fonts, styles, chip } from '../theme'

// O próximo jogo: quando, onde, quem joga com quem.
//
// Vem de `get_next_match()`, que só devolve jogos já publicados — um sorteio
// em rascunho nunca aparece aqui. A escalação guardada é a fonte de verdade:
// não se recalcula nada depois de publicado.

const TIME_A = { nome: '⚫ Pretos', cor: '#8A96A0' }
const TIME_B = { nome: '⚪ Brancos', cor: '#F2F5F2' }

export function SemProximoJogo({ compacto = false }) {
  return (
    <div
      className="pb-card"
      style={{ textAlign: 'center', padding: compacto ? 20 : 30 }}
    >
      <div style={{ fontSize: 30, marginBottom: 8 }} aria-hidden>
        📅
      </div>
      <p style={{ ...styles.mutedText, maxWidth: 380, margin: '0 auto' }}>
        Ainda não existe um próximo jogo publicado.
      </p>
    </div>
  )
}

// Data, hora, local e mapa.
export function InfoDoJogo({ jogo, children }) {
  const d = useMemo(() => formatarDataDoJogo(jogo?.kickoff_at), [jogo?.kickoff_at])
  // `formatarDataDoJogo` devolve sempre um objeto (com strings vazias quando
  // não há data), por isso o objeto em si é sempre "verdadeiro". Sem olhar
  // para o conteúdo, um jogo sem `kickoff_at` — uma rodada antiga reaberta,
  // que o `get_next_match()` deixa passar — imprimia uma vírgula solta e um
  // relógio em branco.
  const temData = Boolean(d.hora)

  return (
    <div className="pb-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div
          style={{
            fontFamily: fonts.title,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            fontSize: 12,
            color: colors.grass,
          }}
        >
          Próximo jogo
        </div>
        <div
          className="pb-break"
          style={{ fontFamily: fonts.title, fontSize: 22, marginTop: 6, lineHeight: 1.2 }}
        >
          {jogo?.location || 'Local por confirmar'}
        </div>
        {temData ? (
          <div style={{ fontSize: 15, color: colors.text, marginTop: 6 }}>
            <span style={{ textTransform: 'capitalize' }}>{d.diaDaSemana}</span>, {d.data}
            <br />
            <span
              style={{
                fontFamily: fonts.title,
                fontSize: 28,
                fontWeight: 700,
                color: colors.text,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {d.hora}
            </span>
          </div>
        ) : (
          <div style={{ ...styles.mutedText, fontSize: 14, marginTop: 6 }}>
            Data e hora por confirmar.
          </div>
        )}
      </div>

      {jogo?.map_url && (
        <a
          href={jogo.map_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...styles.buttonGhost,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            textDecoration: 'none',
            color: colors.text,
            padding: '12px 16px',
          }}
        >
          📍 Ver no mapa
        </a>
      )}

      <Countdown kickoffAt={jogo?.kickoff_at} status={jogo?.status} />

      {children}
    </div>
  )
}

// Cor de cada nível de equilíbrio. Os nomes e os limiares vêm do motor de
// sorteio (`avaliarEquilibrio`) — aqui só se pinta o que ele decidiu.
const COR_DO_EQUILIBRIO = {
  excelente: colors.grass,
  bom: colors.grass,
  regular: colors.teamA,
  desequilibrado: colors.error,
}

// Forças das duas equipas, lado a lado.
export function ForcaDasEquipas({ jogo }) {
  const a = Number(jogo?.team_a_overall || 0)
  const b = Number(jogo?.team_b_overall || 0)
  if (!a && !b) return null
  // `Number(null)` é 0: ler o `balance_pct` sem o testar antes transformava
  // "equilíbrio desconhecido" em "0,0% — Excelente", com as duas equipas a
  // dizer 340 contra 300 mesmo ao lado. Sem valor gravado, deriva-se dos dois
  // overalls pelo mesmo cálculo do sorteio em vez de inventar um número.
  const guardado = jogo?.balance_pct == null ? NaN : Number(jogo.balance_pct)
  const equilibrio = avaliarEquilibrio(a, b)
  const diff = equilibrio.diff
  const pct = Number.isFinite(guardado) ? guardado : equilibrio.balancePct
  const nivel = {
    texto: equilibrio.balanceLabel,
    cor: COR_DO_EQUILIBRIO[equilibrio.balanceLevel] || colors.muted,
  }
  // Quem está mais forte tem de se ler sem fazer a subtração de cabeça —
  // sobretudo depois de uma desistência, em que a diferença deixa de ser
  // um acaso do sorteio e passa a ser uma consequência da troca.
  const quemManda = vantagem(a, b)

  const col = (nome, cor, valor) => (
    <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
      <div className="pb-truncate" style={{ fontSize: 12, color: cor, letterSpacing: 1 }}>
        {nome}
      </div>
      <div
        style={{
          fontFamily: fonts.title,
          fontSize: 26,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {valor}
      </div>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {col(TIME_A.nome, TIME_A.cor, a)}
        <span style={{ fontSize: 12, color: colors.muted }}>vs</span>
        {col(TIME_B.nome, TIME_B.cor, b)}
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 6,
          marginTop: 8,
        }}
      >
        <span style={chip(nivel.cor, `${nivel.cor}1A`)}>
          ⚖️ Equilíbrio: {nivel.texto} · {pct.toFixed(1)}% · Δ {diff}
        </span>
        {/* o Δ e a percentagem já estão na etiqueta ao lado */}
        {quemManda.lado && <VantagemAtual vantagem={quemManda} comNumeros={false} />}
      </div>
    </div>
  )
}

// O bloco completo: campo + informações. Usado na Home e na página do jogo.
export default function NextMatch({ jogo, onPlayerClick, meuId, compacto = false }) {
  const estado = useMemo(
    () => estadoDoJogo(jogo?.kickoff_at, new Date(), jogo?.status),
    [jogo?.kickoff_at, jogo?.status]
  )

  if (!jogo) return <SemProximoJogo compacto={compacto} />

  const temEscalacao = Array.isArray(jogo.lineup) && jogo.lineup.length > 0
  const rodizio = jogo.gk_mode === 'ROTATING'

  return (
    <>
      <div className="pb-grid">
      <div className="pb-col-8 pb-col-md-12">
        <div className="pb-card pb-fill-row" style={{ padding: 12 }}>
          {rodizio && (
            <p
              style={{
                ...styles.mutedText,
                fontSize: 12,
                textAlign: 'center',
                marginBottom: 8,
              }}
            >
              🔄 Goleiro rotativo — 🧤 marca quem <strong>inicia no gol</strong>
              {jogo.gk_rotation_minutes ? `, troca a cada ${jogo.gk_rotation_minutes} min` : ''}
            </p>
          )}
          {/* O aviso do rodízio fica colado ao topo; é o campo que se centra no
              espaço que sobrar quando a barra lateral for mais alta. */}
          <div className="pb-fill-center">
            {temEscalacao ? (
              <FootballPitch
                lineup={jogo.lineup}
                showOverall
                interactive={!!onPlayerClick}
                onPlayerClick={onPlayerClick}
                gkMode={jogo.gk_mode}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 30 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }} aria-hidden>
                  🎲
                </div>
                <p style={styles.mutedText}>
                  O jogo está marcado, mas as equipas ainda não foram sorteadas.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="pb-col-4 pb-col-md-12">
        <div className="pb-stack">
          <InfoDoJogo jogo={jogo}>
            <ForcaDasEquipas jogo={jogo} />
          </InfoDoJogo>

          {/* logo a seguir às forças: é a explicação delas */}
          <AvisoDeDesistencias jogo={jogo} />

          {/* Antes da escalação: quem começa no gol é a primeira coisa que
              o jogador quer saber ao abrir um sorteio com rodízio. */}
          <RodizioTimeline jogo={jogo} meuId={meuId} compacto />

        </div>
      </div>
      </div>

      {/* As escalacoes tambem saem da coluna estreita.
          Eram o bloco mais alto da barra lateral (436px a 1400px) e, como o
          card do campo acompanha a altura da coluna, eram elas que abriam os
          101px de vazio por cima e por baixo do campo. A largura toda tambem
          lhes assenta melhor: sao duas listas lado a lado, e em 445px ficavam
          espremidas uma sobre a outra. */}
      {temEscalacao && (
        <div className="pb-card">
          <div
            style={{
              fontFamily: fonts.title,
              letterSpacing: 1,
              fontSize: 14,
              marginBottom: 10,
            }}
          >
            Escalações
          </div>
          <div className="pb-cards" style={{ gap: 12 }}>
            {['A', 'B'].map((lado) => {
              const t = lado === 'A' ? TIME_A : TIME_B
              const lista = jogo.lineup.filter((l) => l.team === lado)
              if (!lista.length) return null
              return (
                <div key={lado}>
                  <div
                    style={{
                      fontSize: 12,
                      color: t.cor,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      marginBottom: 6,
                    }}
                  >
                    {t.nome}
                  </div>
                  <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {lista.map((l) => (
                      <li
                        key={l.player_id}
                        style={{
                          display: 'flex',
                          gap: 8,
                          alignItems: 'baseline',
                          fontSize: 13,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            color: colors.muted,
                            width: 38,
                            flexShrink: 0,
                            letterSpacing: 0.5,
                          }}
                          title={nomeDaPosicao(l.assigned_position)}
                        >
                          {l.assigned_position}
                        </span>
                        <span className="pb-truncate" style={{ flex: 1 }}>
                          {l.name}
                          {rodizio && l.gk_order === 1 && (
                            <span
                              style={{ color: colors.teamA, fontSize: 11, marginLeft: 4 }}
                              title="Inicia no gol"
                            >
                              🧤
                            </span>
                          )}
                          {l.substitute_for && (
                            <span
                              style={{ color: colors.teamA, fontSize: 11, marginLeft: 4 }}
                              title={`Entrou no lugar de ${l.substitute_for} (desistência)`}
                            >
                              🔄
                            </span>
                          )}
                        </span>
                        {l.overall_at_draw != null && (
                          <span
                            style={{
                              fontSize: 12,
                              color: colors.teamA,
                              fontWeight: 700,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {l.overall_at_draw}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
          <p style={{ ...styles.mutedText, fontSize: 11, marginTop: 10 }}>
            O overall mostrado é o do momento do sorteio — não muda quando as estatísticas
            forem recalculadas.
            {jogo.lineup.some((l) => l.substitute_for) && ' 🔄 = entrou por desistência.'}
          </p>
        </div>
      )}

      {estado.estado === 'aguarda-resultado' && (
        <div className="pb-card" style={{ borderColor: colors.teamA }}>
          {/* "Campeões da semana" era uma secção da Home que deixou de
              existir quando a Home passou a mostrar só o estado atual —
              mandar lá quem lê isto era mandá-lo a lado nenhum. */}
          <p style={{ fontSize: 14 }}>
            ⏳ O jogo já foi. Assim que o admin registar o resultado, ele aparece aqui e no
            histórico.
          </p>
        </div>
      )}

      {/* O sorteio como imagem. O renderizador ja existia no `share.js` desde
          sempre, mas o botao vivia so no feed (Historico -> Ultimas) — ou seja,
          a tres toques de distancia de onde as pessoas olham para a escalacao.
          Aqui esta onde ela esta. */}
      {temEscalacao && (
        <BotaoPartilhar
          nome={`sorteio-${(jogo.kickoff_at || '').slice(0, 10) || 'pelada'}`}
          titulo="Pelada Browns — Sorteio"
          rotulo="📲 Partilhar sorteio"
          gerar={() => renderSorteioImagem({ jogo })}
        />
      )}

      {/* A previsao vive FORA da grelha, a largura toda.
          Estava na barra lateral e crescia-a; como o card do campo acompanha a
          altura da coluna (`pb-fill-row`), cada linha que a lateral ganhava
          virava espaco vazio a volta do campo — e com a previsao inteira la
          dentro isso passou a ser um vao enorme por cima e por baixo.
          Aqui em baixo tambem se le melhor: as barras e o texto pedem largura,
          nao uma coluna de 445px. */}
      <PrevisaoDaPelada jogo={jogo} />
    </>
  )
}
