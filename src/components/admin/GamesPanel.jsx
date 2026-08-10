import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminMatchesUpcoming } from '../../api'
import { formatarDataDoJogo } from '../../lib/countdown'
import {
  ETIQUETA_DA_FASE,
  FASES,
  faseDoJogo,
  jogosComResultadoPendente,
} from '../../lib/lifecycle'
import { estadoDaVotacao } from '../../lib/voting'
import GameDetail from './GameDetail'
import { ErrorBox } from '../Ui'
import { colors, fonts, styles, chip } from '../../theme'

// A lista de jogos do painel — cada um abre a sua página de detalhe, onde
// vive TODO o ciclo (sorteio, resultado, fotos, cancelamento, histórico).

const TOM_COR = { ok: colors.grass, aviso: colors.teamA, erro: colors.error, neutro: colors.muted }

// O lembrete "como terminou o jogo?" mostra-se uma vez por sessão. Vive a
// nível de módulo: sobrevive a trocar de aba e a fechar/reabrir o admin, mas
// morre com o refresh — exatamente o que "uma vez por sessão" quer dizer.
let lembreteDispensado = false

export default function GamesPanel({
  pw,
  jogadores,
  matches,
  // a visão geral pode mandar abrir um jogo concreto; `onAbertoConsumido`
  // limpa o pedido para ele não voltar a abrir sozinho na próxima visita
  abrirId = null,
  onAbertoConsumido,
  onAbrirAssistente,
  onAbrirDesistencias,
}) {
  const [jogos, setJogos] = useState(null) // null = a carregar
  const [erro, setErro] = useState('')
  const [faltaMigracao, setFaltaMigracao] = useState(false)
  const [abertoId, setAbertoId] = useState(abrirId)
  const [pedidoAplicado, setPedidoAplicado] = useState(abrirId)
  if (abrirId && abrirId !== pedidoAplicado) {
    setPedidoAplicado(abrirId)
    setAbertoId(abrirId)
    onAbertoConsumido?.()
  }
  const [, setTick] = useState(0) // re-render depois de dispensar o lembrete

  const carregar = useCallback(
    () =>
      adminMatchesUpcoming(pw)
        .then((l) => {
          setJogos(l || [])
          setFaltaMigracao(false)
        })
        .catch((e) => {
          setFaltaMigracao(e.code === 'SEMMIGRACAO')
          setErro(e.message)
          setJogos([])
        }),
    [pw]
  )

  useEffect(() => {
    carregar()
  }, [carregar])

  const pendentes = useMemo(() => jogosComResultadoPendente(jogos || []), [jogos])

  const aberto = useMemo(() => (jogos || []).find((j) => j.id === abertoId) || null, [jogos, abertoId])

  // As mutações do detalhe devolvem o jogo recalculado — troca-se na lista.
  // `null` = "não sei o estado novo" (fotos): recarrega-se do servidor.
  const atualizar = (novo) => {
    if (novo?.id) setJogos((l) => (l || []).map((j) => (j.id === novo.id ? novo : j)))
    else carregar()
  }

  const apagado = (id) => {
    setJogos((l) => (l || []).filter((j) => j.id !== id))
    setAbertoId(null)
  }

  if (faltaMigracao) {
    return (
      <div className="pb-card">
        <p style={{ ...styles.mutedText, fontSize: 13 }}>
          ⚠️ A gestão de jogos precisa das migrações <strong>0016</strong> a{' '}
          <strong>0019</strong> no Supabase (instruções em <code>supabase/APLICAR.md</code>).
        </p>
      </div>
    )
  }

  if (aberto) {
    return (
      <GameDetail
        pw={pw}
        jogo={aberto}
        jogadores={jogadores}
        matches={matches}
        onVoltar={() => setAbertoId(null)}
        onAtualizado={atualizar}
        onAbrirAssistente={onAbrirAssistente}
        onAbrirDesistencias={onAbrirDesistencias}
        onApagado={apagado}
      />
    )
  }

  return (
    <div className="pb-stack">
      {erro && !faltaMigracao && <ErrorBox>{erro}</ErrorBox>}

      {/* ---------- lembrete de resultado pendente ---------- */}
      {pendentes.length > 0 && !lembreteDispensado && (
        <div className="pb-card" role="status" style={{ borderColor: colors.teamA, background: 'rgba(255, 197, 49, 0.06)' }}>
          <div style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15, marginBottom: 6 }}>
            ⏳ Como terminou{' '}
            {pendentes.length === 1
              ? `o jogo de ${formatarDataDoJogo(pendentes[0].kickoff_at).diaDaSemana || 'marcado'}`
              : `— há ${pendentes.length} jogos sem resultado`}
            ?
          </div>
          <p style={{ ...styles.mutedText, fontSize: 13, marginBottom: 12 }}>
            Enquanto o resultado não for publicado, o jogo não conta nas estatísticas nem aparece
            nos campeões da semana.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setAbertoId(pendentes[0].id)}
              style={{ ...styles.button, flex: '2 1 170px', width: 'auto' }}
            >
              Preencher resultado
            </button>
            <button
              type="button"
              onClick={() => {
                lembreteDispensado = true
                setTick((t) => t + 1)
              }}
              style={{ ...styles.buttonGhost, flex: '1 1 120px', width: 'auto' }}
            >
              Fazer depois
            </button>
          </div>
        </div>
      )}

      {/* ---------- a lista ---------- */}
      {jogos === null ? (
        <p style={styles.mutedText}>A carregar…</p>
      ) : jogos.length === 0 ? (
        <div className="pb-card" style={{ textAlign: 'center', padding: 24 }}>
          <p style={{ ...styles.mutedText, marginBottom: 12 }}>
            Não há jogos abertos. As rodadas já fechadas continuam em “Rodadas antigas”.
          </p>
          <button type="button" onClick={onAbrirAssistente} style={{ ...styles.button, width: 'auto', padding: '12px 20px' }}>
            📅 Marcar jogo novo
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p style={{ ...styles.mutedText, fontSize: 13 }}>
              {jogos.length === 1 ? '1 jogo aberto' : `${jogos.length} jogos abertos`} — toca num
              para gerir tudo: sorteio, resultado, fotos e cancelamento.
            </p>
            <button
              type="button"
              onClick={onAbrirAssistente}
              style={{ ...styles.buttonGhost, width: 'auto', padding: '8px 14px', flexShrink: 0 }}
            >
              + Marcar jogo
            </button>
          </div>

          <div className="pb-stack-sm pb-stagger">
            {jogos.map((j) => {
              const fase = faseDoJogo(j)
              const e = ETIQUETA_DA_FASE[fase] || { texto: fase, icone: '•', tom: 'neutro' }
              const cor = TOM_COR[e.tom] || colors.muted
              const d = formatarDataDoJogo(j.kickoff_at)
              const votacao = estadoDaVotacao(j)
              const pendente =
                fase === FASES.AGUARDA_RESULTADO ||
                fase === FASES.RESULTADO_RASCUNHO ||
                votacao.emRevisao
              return (
                <button
                  key={j.id}
                  type="button"
                  onClick={() => setAbertoId(j.id)}
                  className="pb-card pb-card-hover pb-tap"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    width: '100%',
                    textAlign: 'left',
                    color: colors.text,
                    font: 'inherit',
                    cursor: 'pointer',
                    borderColor: pendente ? colors.teamA : undefined,
                  }}
                >
                  <span aria-hidden style={{ fontSize: 22, flexShrink: 0 }}>
                    {e.icone}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="pb-truncate" style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>
                      {d.hora ? `${d.data} · ${d.hora}` : 'Sem data'} — {j.location || 'sem local'}
                    </span>
                    <span style={{ fontSize: 12, color: colors.muted }}>
                      {Array.isArray(j.lineup) && j.lineup.length
                        ? `${j.lineup.length} jogadores escalados`
                        : 'sem equipas'}
                      {j.gk_mode === 'ROTATING' ? ' · 🔄 rodízio' : ''}
                      {j.score_a != null && j.result_status !== 'NONE'
                        ? ` · ${j.score_a}–${j.score_b}`
                        : ''}
                    </span>
                    {/* A votação a decorrer é a informação mais acionável que
                        um jogo já jogado tem: sem ela na lista, o admin não
                        tinha como saber que faltavam votos sem abrir cada um. */}
                    {votacao.aberta && (
                      <span style={{ fontSize: 12, color: colors.grass }}>
                        🗳️ {votacao.votantes}/{votacao.total} votaram
                        {votacao.tempo.conhecido && !votacao.tempo.expirado
                          ? ` · fecha em ${votacao.tempo.texto}`
                          : ''}
                      </span>
                    )}
                    {votacao.emRevisao && (
                      <span style={{ fontSize: 12, color: colors.teamA, fontWeight: 600 }}>
                        ⚠️ votação à espera de decisão
                      </span>
                    )}
                  </span>
                  <span style={{ ...chip(cor, `${cor}1A`), flexShrink: 0 }}>{e.texto}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
