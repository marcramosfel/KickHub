import { useMemo } from 'react'
import { formatarDataDoJogo } from '../../lib/countdown'
import {
  faseDoJogo,
  ETIQUETA_DA_FASE,
  jogosComResultadoPendente,
  proximoJogoDoAdmin,
} from '../../lib/lifecycle'
import { nomeDaEquipa } from '../../lib/substitutions'
import { colors, fonts, styles, chip } from '../../theme'

// A primeira coisa que o admin vê.
//
// Antes o painel abria nos "Pedidos" — normalmente vazios — e o que era
// urgente (um jogo de sábado por registar) estava três abas à frente. Aqui
// em cima ficam os números que dizem se há trabalho, e os atalhos para o
// fazer; por baixo, só o que precisa mesmo de atenção.

function Metrica({ rotulo, valor, tom, onClick, dica }) {
  const cor = tom === 'alerta' ? colors.error : tom === 'aviso' ? colors.teamA : colors.grass
  const conteudo = (
    <>
      <div
        style={{
          fontFamily: fonts.title,
          fontSize: 30,
          lineHeight: 1,
          fontWeight: 700,
          color: valor ? cor : colors.muted,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {valor}
      </div>
      <div style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>{rotulo}</div>
    </>
  )
  const base = {
    padding: 14,
    borderRadius: 12,
    border: `1px solid ${valor && tom ? `${cor}55` : colors.line}`,
    background: valor && tom ? `${cor}0D` : colors.panel,
    textAlign: 'left',
    minHeight: 44,
    width: '100%',
  }
  if (!onClick) return <div style={base}>{conteudo}</div>
  return (
    <button
      type="button"
      onClick={onClick}
      title={dica}
      style={{ ...base, font: 'inherit', color: colors.text, cursor: 'pointer' }}
    >
      {conteudo}
    </button>
  )
}

function Seccao({ titulo, children, acao }) {
  return (
    <section className="pb-card">
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <h2 style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 14, margin: 0 }}>
          {titulo}
        </h2>
        {acao}
      </div>
      {children}
    </section>
  )
}

export default function AdminOverview({
  jogosAbertos = [],
  jogadores = [],
  pedidos = [],
  feed = [],
  onIr,
  onAbrirJogo,
}) {
  const pendentes = useMemo(() => jogosComResultadoPendente(jogosAbertos), [jogosAbertos])

  const proximo = useMemo(() => proximoJogoDoAdmin(jogosAbertos), [jogosAbertos])

  const semPosicao = jogadores.filter((j) => !j.primaryPosition).length
  const ultimaPublicacao = feed[0] || null

  const d = formatarDataDoJogo(proximo?.kickoff_at)
  const fase = proximo ? faseDoJogo(proximo) : null
  const etiqueta = fase ? ETIQUETA_DA_FASE[fase] : null

  const alertas = [
    pendentes.length > 0 && {
      tom: 'alerta',
      texto:
        pendentes.length === 1
          ? 'Há um jogo à espera do resultado.'
          : `Há ${pendentes.length} jogos à espera do resultado.`,
      rotulo: 'Registar',
      ir: 'jogos-ciclo',
    },
    pedidos.length > 0 && {
      tom: 'aviso',
      texto: `${pedidos.length} ${pedidos.length === 1 ? 'pedido' : 'pedidos'} de entrada por aprovar.`,
      rotulo: 'Ver pedidos',
      ir: 'pedidos',
    },
    semPosicao > 0 && {
      tom: 'aviso',
      texto: `${semPosicao} ${semPosicao === 1 ? 'jogador' : 'jogadores'} sem posição — o sorteio coloca-os ao calhas.`,
      rotulo: 'Definir',
      ir: 'posicoes',
    },
  ].filter(Boolean)

  return (
    <div className="pb-stack">
      {/* ---------- números ---------- */}
      <div className="pb-cards-sm">
        <Metrica
          rotulo="jogos por registar"
          valor={pendentes.length}
          tom="alerta"
          onClick={() => onIr('jogos-ciclo')}
          dica="Ir aos jogos"
        />
        <Metrica
          rotulo="pedidos de entrada"
          valor={pedidos.length}
          tom="aviso"
          onClick={() => onIr('pedidos')}
          dica="Ver pedidos"
        />
        <Metrica
          rotulo="sem posição definida"
          valor={semPosicao}
          tom="aviso"
          onClick={() => onIr('posicoes')}
          dica="Definir posições"
        />
        <Metrica rotulo="jogadores no plantel" valor={jogadores.length} onClick={() => onIr('plantel')} />
        <Metrica
          rotulo="avaliação do grupo"
          valor="→"
          onClick={() => onIr('faltas')}
          dica="Quem falta entregar as notas"
        />
      </div>

      {/* ---------- alertas ---------- */}
      {alertas.length > 0 && (
        <div className="pb-stack-sm">
          {alertas.map((a, i) => {
            const cor = a.tom === 'alerta' ? colors.error : colors.teamA
            return (
              <div
                key={i}
                role="status"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: `1px solid ${cor}55`,
                  background: `${cor}14`,
                  fontSize: 13,
                }}
              >
                <span aria-hidden>{a.tom === 'alerta' ? '⛔' : '⚠️'}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{a.texto}</span>
                <button
                  type="button"
                  onClick={() => onIr(a.ir)}
                  className="pb-tab"
                  style={{ fontSize: 12, color: cor, flexShrink: 0 }}
                >
                  {a.rotulo} →
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="pb-grid">
        {/* ---------- próximo jogo ---------- */}
        <div className="pb-col-7 pb-col-md-12">
          <Seccao
            titulo="Próximo jogo"
            acao={
              <button
                type="button"
                onClick={() => onIr('novo')}
                className="pb-tab"
                style={{ fontSize: 12 }}
              >
                🎲 Marcar jogo
              </button>
            }
          >
            {!proximo ? (
              <p style={{ ...styles.mutedText, fontSize: 13 }}>
                Não há jogos marcados. Começa em <strong>Novo sorteio</strong>.
              </p>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: fonts.title, fontSize: 17 }}>
                    {d.hora ? `${d.data} · ${d.hora}` : 'Sem data'}
                  </span>
                  {etiqueta && <span style={chip(colors.grass)}>{etiqueta.texto}</span>}
                </div>
                <p style={{ ...styles.mutedText, fontSize: 13, margin: '4px 0 10px' }}>
                  {proximo.location || 'Local por confirmar'}
                  {proximo.team_a_overall
                    ? ` · ${nomeDaEquipa('A')} ${proximo.team_a_overall} vs ${nomeDaEquipa('B')} ${proximo.team_b_overall}`
                    : ' · ainda sem sorteio'}
                </p>
                <button
                  type="button"
                  onClick={() => onAbrirJogo?.(proximo.id)}
                  style={{
                    ...styles.button,
                    width: 'auto',
                    padding: '10px 16px',
                    fontSize: 14,
                    minHeight: 44, // área de toque mínima
                  }}
                >
                  Abrir jogo
                </button>
              </div>
            )}
          </Seccao>
        </div>

        {/* ---------- última publicação ---------- */}
        <div className="pb-col-5 pb-col-md-12">
          <Seccao
            titulo="Última publicação"
            acao={
              ultimaPublicacao && (
                <span style={{ ...styles.mutedText, fontSize: 11 }}>
                  {formatarDataDoJogo(ultimaPublicacao.published_at).data || ''}
                </span>
              )
            }
          >
            {!ultimaPublicacao ? (
              <p style={{ ...styles.mutedText, fontSize: 13 }}>
                Ainda não publicaste nada. Os posts nascem ao publicar o sorteio e o resultado.
              </p>
            ) : (
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{ultimaPublicacao.title}</div>
                {ultimaPublicacao.body && (
                  <p
                    style={{
                      ...styles.mutedText,
                      fontSize: 12,
                      margin: '6px 0 0',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {ultimaPublicacao.body}
                  </p>
                )}
              </div>
            )}
          </Seccao>
        </div>
      </div>

      {/* ---------- jogos à espera de resultado ---------- */}
      {pendentes.length > 0 && (
        <Seccao titulo={`À espera de resultado (${pendentes.length})`}>
          <div className="pb-stack-sm">
            {pendentes.map((m) => {
              const dd = formatarDataDoJogo(m.kickoff_at)
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onAbrirJogo?.(m.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    minHeight: 44,
                    padding: 10,
                    borderRadius: 10,
                    border: `1px solid ${colors.line}`,
                    background: '#0C1915',
                    color: colors.text,
                    font: 'inherit',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span aria-hidden>⏳</span>
                  <span className="pb-truncate" style={{ flex: 1, fontSize: 14 }}>
                    {dd.hora ? `${dd.data} · ${dd.hora}` : 'sem data'} — {m.location || 'sem local'}
                  </span>
                  <span style={{ fontSize: 12, color: colors.grass, flexShrink: 0 }}>
                    Registar →
                  </span>
                </button>
              )
            })}
          </div>
        </Seccao>
      )}
    </div>
  )
}
