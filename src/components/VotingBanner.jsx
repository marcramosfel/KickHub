import { useEffect, useState } from 'react'
import { faltaVotarTexto, tempoAteFechar } from '../lib/voting'
import { colors, fonts } from '../theme'

// Faixa fixa no topo enquanto houver voto por dar.
//
// Antes, o único lembrete era um cartão a meio da Home — e só para o
// craque/bagre: a avaliação por estrelas não tinha aviso NENHUM (o contador
// da app só olhava para `award_votes`). Quem não fosse à aba "Rodadas" nunca
// sabia que ela existia.
//
// Uma faixa, em qualquer ecrã, com o que falta e quanto tempo resta. Nas
// últimas horas muda de tom — o prazo é a única alavanca que temos aqui.

export default function VotingBanner({ pendencias, onVotar }) {
  // O tempo tem de contar sozinho: a faixa fica no ecrã durante minutos e
  // "faltam 2h" não pode continuar a dizer o mesmo uma hora depois.
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60000)
    return () => clearInterval(t)
  }, [])

  const lista = Array.isArray(pendencias) ? pendencias : []
  if (!lista.length) return null

  // A mais urgente manda na faixa; as outras entram na contagem.
  const ordenadas = [...lista].sort((a, b) => {
    const ta = a.deadline ? new Date(a.deadline).getTime() : Infinity
    const tb = b.deadline ? new Date(b.deadline).getTime() : Infinity
    return ta - tb
  })
  const p = ordenadas[0]
  const tempo = tempoAteFechar(p.deadline)
  const urgente = tempo.urgente && !tempo.expirado
  const cor = urgente ? colors.teamA : colors.grass
  const falta = faltaVotarTexto(p)

  return (
    <div
      role="status"
      style={{
        position: 'sticky',
        // Encostada POR BAIXO da barra superior, que também é sticky em
        // `top: 0` com z-index maior. Com as duas no mesmo topo, a faixa
        // deslizava para debaixo do cabeçalho e desaparecia — o lembrete
        // mais importante da app a esconder-se ao primeiro scroll.
        top: 'var(--pb-header-h)',
        zIndex: 40,
        background: urgente ? 'rgba(255,197,49,0.14)' : 'rgba(52,208,88,0.12)',
        borderBottom: `1px solid ${cor}55`,
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
    >
      <div
        className="pb-container"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px',
          flexWrap: 'wrap',
        }}
      >
        <span aria-hidden style={{ fontSize: 18, flexShrink: 0 }}>
          {urgente ? '⏰' : '🗳️'}
        </span>
        <span style={{ flex: 1, minWidth: 140, fontSize: 14, lineHeight: 1.35 }}>
          <strong>Falta o teu voto</strong>
          {falta ? <span style={{ color: colors.muted }}> — {falta}</span> : null}
          {tempo.conhecido && !tempo.expirado && (
            <span style={{ display: 'block', fontSize: 12, color: cor, fontWeight: 600 }}>
              {urgente ? 'Fecha hoje' : 'Fecha'} em {tempo.texto}
              {ordenadas.length > 1 ? ` · ${ordenadas.length} rodadas por votar` : ''}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => onVotar?.(p.match_id)}
          style={{
            flexShrink: 0,
            background: cor,
            color: '#06130D',
            border: 'none',
            borderRadius: 999,
            padding: '10px 18px',
            minHeight: 44,
            fontFamily: fonts.title,
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}
        >
          Votar
        </button>
      </div>
    </div>
  )
}
