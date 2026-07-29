import { useMemo } from 'react'
import { nomeDaPosicao } from '../lib/positions'
import { corDaEquipa, resumoDeDesistencias } from '../lib/substitutions'
import Avatar from './Avatar'
import { colors, fonts, styles, chip } from '../theme'

// As desistências de última hora, à vista de toda a gente.
//
// Substituir quem desistiu desfaz o equilíbrio do sorteio, e é suposto: o
// objetivo da troca é ter 7 contra 7, não voltar a equilibrar. O que não
// pode acontecer é alguém chegar ao campo e achar que o sorteio saiu
// torto — por isso a causa e o efeito aparecem sempre juntos.

const COR_DO_NIVEL = {
  excelente: colors.grass,
  bom: colors.grass,
  regular: colors.teamA,
  desequilibrado: colors.error,
  desconhecido: colors.muted,
}

// "+12" / "−7": o sinal conta a história, o zero também.
function Delta({ valor, style }) {
  if (valor == null) return null
  const cor = valor > 0 ? colors.grass : valor < 0 ? colors.error : colors.muted
  const sinal = valor > 0 ? '+' : valor < 0 ? '−' : '±'
  return (
    <span
      style={{
        fontFamily: fonts.title,
        fontWeight: 700,
        color: cor,
        fontVariantNumeric: 'tabular-nums',
        ...style,
      }}
    >
      {sinal}
      {Math.abs(valor)}
    </span>
  )
}

// Quem está mais forte agora. Usado dentro do aviso e sozinho ao lado das
// forças das equipas.
export function VantagemAtual({ vantagem: v, comNumeros = true, style }) {
  if (!v) return null
  const cor = v.lado ? corDaEquipa(v.lado) : COR_DO_NIVEL[v.nivel] || colors.muted
  if (v.nivel === 'desconhecido') return null

  return (
    <span style={{ ...chip(cor, `${cor}1A`), ...style }}>
      {v.lado ? '💪' : '⚖️'} {v.texto}
      {comNumeros && v.diff > 0 ? ` · Δ ${v.diff} (${v.pct.toFixed(1)}%)` : ''}
    </span>
  )
}

// Uma troca: quem saiu, quem entrou, onde, e o que isso fez à equipa.
function Troca({ t }) {
  const cor = corDaEquipa(t.lado) || colors.muted
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 0',
        borderTop: `1px solid ${colors.line}`,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ opacity: 0.45 }}>
          <Avatar name={t.saiNome} photo={t.saiFoto} size={26} />
        </span>
        <span aria-hidden style={{ color: colors.muted, fontSize: 13 }}>
          →
        </span>
        <Avatar name={t.entraNome} photo={t.entraFoto} size={26} />
      </span>

      <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
        {/* a seta entre os avatares é decorativa (aria-hidden); esta é a que
            um leitor de ecrã ouve, senão ficavam dois nomes soltos */}
        <span className="pb-truncate" style={{ display: 'block' }}>
          <span style={{ color: colors.muted, textDecoration: 'line-through' }}>{t.saiNome}</span>
          <span style={{ color: colors.muted }}> → </span>
          <strong>{t.entraNome}</strong>
        </span>
        <span style={{ fontSize: 11, color: colors.muted, display: 'block' }}>
          <span style={{ color: cor }}>{t.equipa}</span> ·{' '}
          {t.ehGoleiro ? 'Goleiro' : nomeDaPosicao(t.slot)}
          {t.motivo ? ` · ${t.motivo}` : ''}
        </span>
      </span>

      <Delta valor={t.delta} style={{ fontSize: 14, flexShrink: 0 }} />
    </li>
  )
}

// O aviso completo. Devolve `null` quando não houve desistências — os
// ecrãs podem chamá-lo sempre sem terem de saber disso.
export default function AvisoDeDesistencias({ jogo, titulo = 'Desistências de última hora' }) {
  const r = useMemo(() => resumoDeDesistencias(jogo), [jogo])
  if (!r.houve) return null

  const { impacto, vantagem: v } = r
  const cor = colors.teamA

  return (
    <div
      className="pb-card"
      style={{ borderColor: cor, background: 'rgba(255, 197, 49, 0.06)' }}
      role="status"
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 14, color: cor }}>
          🔄 {titulo}
        </span>
        <span style={{ ...styles.mutedText, fontSize: 12 }}>
          {r.total === 1 ? '1 jogador trocado' : `${r.total} jogadores trocados`}
        </span>
      </div>

      <p style={{ ...styles.mutedText, fontSize: 13, margin: '8px 0 4px' }}>
        Estes jogadores avisaram que não podiam ir e foram substituídos <strong>depois</strong> do
        sorteio. A troca serve para os times ficarem completos — não para os reequilibrar.
      </p>

      <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }}>
        {r.trocas.map((t) => (
          <Troca key={t.id} t={t} />
        ))}
      </ul>

      <div
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: `1px solid ${colors.line}`,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <VantagemAtual vantagem={v} />
        {(impacto.A !== 0 || impacto.B !== 0) && (
          <span style={{ ...styles.mutedText, fontSize: 12 }}>
            com as trocas: ⚫ <Delta valor={impacto.A} style={{ fontSize: 12 }} /> · ⚪{' '}
            <Delta valor={impacto.B} style={{ fontSize: 12 }} />
          </span>
        )}
      </div>

      {impacto.incerto && (
        <p style={{ ...styles.mutedText, fontSize: 11, marginTop: 6 }}>
          Uma das trocas envolve alguém sem overall calculado — o efeito na força da equipa é uma
          estimativa.
        </p>
      )}

      {!v.equilibrado && v.lado && (
        <p style={{ fontSize: 12, color: colors.error, marginTop: 6 }}>
          ⚠️ As equipas <strong>já não estão equilibradas</strong> — {v.texto} por {v.diff}{' '}
          {v.diff === 1 ? 'ponto' : 'pontos'} de overall.
        </p>
      )}
    </div>
  )
}
