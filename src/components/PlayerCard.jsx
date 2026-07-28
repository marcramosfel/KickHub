import { memo, useMemo } from 'react'
import { badgesDoJogador, molduraPrincipal } from '../lib/achievements'
import {
  iconeDaPosicao,
  nomeDaPosicao,
  PLAYER_TYPE,
  siglaDaPosicao,
} from '../lib/positions'
import { chip, colors, fonts, styles } from '../theme'
import AchievementBadge from './AchievementBadge'
import AchievementFrame from './AchievementFrame'
import Avatar from './Avatar'

const MEDALHAS = ['🥇', '🥈', '🥉']

// Medalha no pódio, número nos restantes.
const marcaDeRank = (n) => (n >= 1 && n <= 3 ? MEDALHAS[n - 1] : `${n}`)

// Chip da posição do jogador (sigla + ícone, nome completo no title).
function ChipPosicao({ jogador, tamanho }) {
  const id = jogador.playerType === PLAYER_TYPE.GOALKEEPER ? 'GK' : jogador.primaryPosition
  if (!id) return null
  return (
    <span
      title={nomeDaPosicao(id)}
      style={{
        ...chip(colors.muted),
        fontSize: tamanho === 'cartao' ? 12 : 10,
        letterSpacing: 0.6,
        gap: 4,
      }}
    >
      <span aria-hidden>{iconeDaPosicao(id)}</span>
      {siglaDaPosicao(id)}
    </span>
  )
}

const nomeTruncado = (fonte, peso) => ({
  fontSize: fonte,
  fontWeight: peso,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
  maxWidth: '100%',
})

function PlayerCardBase({
  jogador,
  liderancas,
  onClick,
  variante = 'linha',
  mostrarPosicao,
  mostrarOverall = true,
  rank,
  destacado = false,
  rotulo,
  style,
}) {
  const id = jogador?.id ?? null

  // Um jogador sem títulos é o caso normal: nada disto custa render extra.
  const principal = useMemo(
    () => (id && liderancas ? molduraPrincipal(id, liderancas) : null),
    [id, liderancas],
  )
  const badges = useMemo(() => {
    if (!id || !liderancas) return []
    const todos = badgesDoJogador(id, liderancas) || []
    // O título principal já aparece na moldura — não se repete em badge.
    return principal ? todos.filter((b) => b.id !== principal.id) : todos
  }, [id, liderancas, principal])

  if (!jogador) return null

  const cartao = variante === 'cartao'
  // Na linha de ranking a posição é ruído; no cartão de destaque faz falta.
  const comPosicao = mostrarPosicao ?? cartao
  const posicaoRank = rank ?? jogador.rank ?? null
  // Number('') é 0 e Number('abc') é NaN — sem isto o cartão mostrava "NaN".
  const overallBruto = Number(jogador.overall)
  const overall =
    jogador.overall == null || !Number.isFinite(overallBruto) ? null : Math.round(overallBruto)
  const clicavel = typeof onClick === 'function'
  const nome = jogador.name || '—'
  // O `rotulo` é a métrica da aba (ex.: "12 gols"). Tem de ser VISÍVEL: nas
  // abas de artilheiros/assistências o overall vem escondido e este texto é o
  // único número da linha.
  const rotuloTexto = rotulo ? String(rotulo) : null
  const rotuloEmDestaque = Boolean(rotuloTexto) && !mostrarOverall

  const marca = posicaoRank == null ? null : marcaDeRank(posicaoRank)
  const legendaRank = posicaoRank == null ? null : `${posicaoRank}.º lugar`

  const conteudo = cartao ? (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 7,
        width: '100%',
        minWidth: 0,
        textAlign: 'center',
      }}
    >
      {marca != null && (
        <span
          role="img"
          aria-label={legendaRank}
          title={legendaRank}
          style={{ ...styles.mutedText, fontSize: 12, fontFamily: fonts.title }}
        >
          {posicaoRank >= 1 && posicaoRank <= 3 ? MEDALHAS[posicaoRank - 1] : `#${posicaoRank}`}
        </span>
      )}
      <Avatar name={nome} photo={jogador.photo} size={68} />
      <span title={nome} style={nomeTruncado(15, 700)}>
        {nome}
      </span>
      {comPosicao && <ChipPosicao jogador={jogador} tamanho="cartao" />}
      {mostrarOverall && (
        <span
          title="Overall"
          style={{
            ...styles.title,
            fontSize: 26,
            lineHeight: 1,
            color: colors.grass,
          }}
        >
          {overall ?? '—'}
        </span>
      )}
      {rotuloTexto && (
        <span
          title={rotuloTexto}
          style={{
            ...styles.title,
            fontSize: rotuloEmDestaque ? 20 : 12,
            lineHeight: 1.2,
            letterSpacing: 0.8,
            color: rotuloEmDestaque ? colors.grass : colors.muted,
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {rotuloTexto}
        </span>
      )}
      {badges.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 5,
            maxWidth: '100%',
          }}
        >
          {badges.map((b) => (
            <AchievementBadge key={b.id} titulo={b} tamanho="xs" />
          ))}
        </div>
      )}
    </div>
  ) : (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minWidth: 0 }}>
      {marca != null && (
        <span
          role="img"
          aria-label={legendaRank}
          title={legendaRank}
          style={{
            width: 24,
            flexShrink: 0,
            textAlign: 'center',
            fontFamily: fonts.title,
            fontSize: 14,
            color: colors.muted,
          }}
        >
          {marca}
        </span>
      )}
      <Avatar name={nome} photo={jogador.photo} size={38} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span title={nome} style={nomeTruncado(14, destacado ? 700 : 500)}>
          {nome}
        </span>
        {(comPosicao || badges.length > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
            {comPosicao && <ChipPosicao jogador={jogador} tamanho="linha" />}
            {badges.map((b) => (
              <AchievementBadge key={b.id} titulo={b} tamanho="xs" comTexto={false} />
            ))}
          </div>
        )}
      </div>
      {(mostrarOverall || rotuloTexto) && (
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 1,
            // Trava o lado direito para o nome nunca ser espremido a 320px.
            maxWidth: '42%',
            minWidth: 0,
          }}
        >
          {mostrarOverall && (
            <span
              title="Overall"
              style={{
                ...styles.title,
                fontSize: 18,
                lineHeight: 1.1,
                color: overall == null ? colors.muted : colors.text,
              }}
            >
              {overall ?? '—'}
            </span>
          )}
          {rotuloTexto && (
            <span
              title={rotuloTexto}
              style={{
                ...styles.title,
                fontSize: rotuloEmDestaque ? 16 : 11,
                lineHeight: 1.2,
                letterSpacing: 0.6,
                color: rotuloEmDestaque ? colors.grass : colors.muted,
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {rotuloTexto}
            </span>
          )}
        </div>
      )}
    </div>
  )

  // Com moldura, o fundo, a borda e o espaçamento exterior são dela — o cartão
  // não os repete (senão ficava padding a dobrar e nada cabia em 320px).
  const caixa = {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    minWidth: 0,
    textAlign: 'left',
    fontFamily: fonts.body,
    color: colors.text,
    background: principal ? 'transparent' : colors.panel,
    border: principal ? 'none' : `1px solid ${destacado ? colors.grass : colors.line}`,
    borderRadius: principal ? 8 : 12,
    padding: principal ? (cartao ? '10px 6px' : '4px 4px') : cartao ? '14px 12px' : '8px 10px',
    ...(principal ? {} : style),
  }

  // O aria-label substitui TODO o conteúdo do botão para o leitor de ecrã, por
  // isso repete aqui o que está visível (lugar e métrica) em vez de o perder.
  const legenda = [`Ver perfil de ${nome}`, legendaRank, rotuloTexto].filter(Boolean).join(', ')

  const corpo = clicavel ? (
    <button type="button" onClick={onClick} aria-label={legenda} style={{ ...caixa, cursor: 'pointer' }}>
      {conteudo}
    </button>
  ) : (
    <div style={caixa}>{conteudo}</div>
  )

  // Sem título principal o AchievementFrame devolve o corpo tal e qual.
  return (
    <AchievementFrame
      titulo={principal}
      tamanho={cartao ? 'md' : 'sm'}
      style={principal ? style : undefined}
    >
      {corpo}
    </AchievementFrame>
  )
}

export default memo(PlayerCardBase)
